import { listFolder } from "@/app/lib/github/list";
import { readFile } from "@/app/lib/github/read";
import { createOrUpdateFile } from "@/app/lib/github/write";
import { parseGoals, parseTasks, parseDailyPlanMarkdown } from "./parser";
import { DailyPlan, TaskItem, GoalItem } from "@/app/types/planner";
import { gemini } from "@/app/lib/ai/gemini";
import { randomUUID } from "crypto";

/**
 * Recursively fetches all markdown files in a given GitHub repository path.
 */
async function fetchAllMarkdownFiles(path: string): Promise<string[]> {
  const files: string[] = [];
  try {
    const items = await listFolder(path);
    if (Array.isArray(items)) {
      for (const item of items) {
        if (item.type === "file" && item.name.endsWith(".md")) {
          files.push(item.path);
        } else if (item.type === "dir") {
          const subFiles = await fetchAllMarkdownFiles(item.path);
          files.push(...subFiles);
        }
      }
    }
  } catch (e) {
    console.warn(`Failed to list folder ${path}:`, e);
  }
  return files;
}

/**
 * Formats a Date object as YYYY-MM-DD in IST (Asia/Kolkata) timezone.
 */
export function getLocalDateString(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  
  const parts = formatter.formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  
  return `${year}-${month}-${day}`;
}

/**
 * Generates today's plan by fetching goals and tasks, parsing them,
 * combining them, optional Gemini refinement, and saving to Daily/YYYY-MM-DD.md
 */
export async function generateDailyPlan(
  targetDate: string = getLocalDateString()
): Promise<DailyPlan> {
  // 1. Fetch Monthly Goals dynamically
  let monthlyGoals: GoalItem[] = [];
  try {
    const yearMonth = targetDate.substring(0, 7); // e.g. "2026-07"
    const monthlyPath = `Goals/Monthly/${yearMonth}.md`;
    try {
      const monthlyContent = await readFile(monthlyPath);
      monthlyGoals = parseGoals(monthlyContent, "monthly");
    } catch {
      try {
        const monthlyContent = await readFile("Goals/Monthly.md");
        monthlyGoals = parseGoals(monthlyContent, "monthly");
      } catch {
        const folderFiles = await listFolder("Goals/Monthly");
        if (Array.isArray(folderFiles) && folderFiles.length > 0) {
          const mdFile = folderFiles.find(
            (f: any) => f.type === "file" && f.name.endsWith(".md")
          );
          if (mdFile) {
            const monthlyContent = await readFile(mdFile.path);
            monthlyGoals = parseGoals(monthlyContent, "monthly");
          }
        }
      }
    }
  } catch (e) {
    console.warn("Goals/Monthly.md folder/file not found or failed to read.");
  }

  // Fetch Weekly Goals dynamically
  let weeklyGoals: GoalItem[] = [];
  try {
    const dateObj = new Date(targetDate);
    const startOfYear = new Date(dateObj.getFullYear(), 0, 1);
    const pastDaysOfYear = (dateObj.getTime() - startOfYear.getTime()) / 86400000;
    const weekNum = Math.ceil((pastDaysOfYear + startOfYear.getDay() + 1) / 7);
    const year = dateObj.getFullYear();
    const formattedWeekNum = String(weekNum).padStart(2, "0");
    const weeklyPath = `Goals/Weekly/${year}-W${formattedWeekNum}.md`;

    try {
      const weeklyContent = await readFile(weeklyPath);
      weeklyGoals = parseGoals(weeklyContent, "weekly");
    } catch {
      try {
        const literalPath = `Goals/Weekly/${year}-Www.md`;
        const weeklyContent = await readFile(literalPath);
        weeklyGoals = parseGoals(weeklyContent, "weekly");
      } catch {
        try {
          const weeklyContent = await readFile("Goals/Weekly.md");
          weeklyGoals = parseGoals(weeklyContent, "weekly");
        } catch {
          const folderFiles = await listFolder("Goals/Weekly");
          if (Array.isArray(folderFiles) && folderFiles.length > 0) {
            const mdFile = folderFiles.find(
              (f: any) => f.type === "file" && f.name.endsWith(".md")
            );
            if (mdFile) {
              const weeklyContent = await readFile(mdFile.path);
              weeklyGoals = parseGoals(weeklyContent, "weekly");
            }
          }
        }
      }
    }
  } catch (e) {
    console.warn("Goals/Weekly.md folder/file not found or failed to read.");
  }

  // 2. Fetch Tasks recursively from Tasks/
  let allTasks: TaskItem[] = [];
  try {
    const mdFiles = await fetchAllMarkdownFiles("Tasks");
    for (const filePath of mdFiles) {
      try {
        const taskContent = await readFile(filePath);
        const parsed = parseTasks(taskContent, filePath);
        allTasks.push(...parsed);
      } catch (err) {
        console.error(`Failed to parse task file ${filePath}:`, err);
      }
    }
  } catch (e) {
    console.warn("Tasks/ folder not found, empty, or failed to recursively list.");
  }

  // Get all active tasks, filtering out completed tasks and boilerplate template items
  const activeBacklogTasks = allTasks.filter((t) => {
    if (t.completed) return false;

    // Exclude boilerplate placeholder tasks from the template
    const lowerTitle = t.title.toLowerCase();
    if (
      lowerTitle.includes("immediate attention task") ||
      lowerTitle.includes("backlog item") ||
      lowerTitle.includes("blocked task") ||
      lowerTitle.includes("finished task") ||
      lowerTitle.match(/^task \d+$/)
    ) {
      return false;
    }

    return true;
  });

  // Filter tasks for the deterministic fallback planner (due today or high priority)
  const todayTasksDeterministic = activeBacklogTasks.filter((t) => {
    if (t.blocked && !t.dueDate) return false;
    if (t.dueDate === targetDate) return true;
    if (t.priority === "high") return true;
    return false;
  });

  const unfinishedWeeklyGoals = weeklyGoals.filter((g) => !g.completed);

  // 3. Generate Markdown Daily Plan
  let markdown = "";
  const hasGemini = !!process.env.GEMINI_API_KEY;
  const hasOpenRouter = !!process.env.OPENROUTER_API_KEY;

  if (hasGemini) {
    try {
      console.log("Trying to plan with Gemini API...");
      markdown = await generatePlanWithAI(
        targetDate,
        activeBacklogTasks,
        unfinishedWeeklyGoals,
        monthlyGoals
      );
    } catch (error) {
      console.error("Gemini API call failed:", error);
      if (hasOpenRouter) {
        try {
          console.log("Falling back to OpenRouter API...");
          markdown = await generatePlanWithOpenRouter(
            targetDate,
            activeBacklogTasks,
            unfinishedWeeklyGoals,
            monthlyGoals
          );
        } catch (openRouterError) {
          console.error("OpenRouter API call failed:", openRouterError);
          markdown = generatePlanDeterministic(
            targetDate,
            todayTasksDeterministic,
            unfinishedWeeklyGoals
          );
        }
      } else {
        markdown = generatePlanDeterministic(
          targetDate,
          todayTasksDeterministic,
          unfinishedWeeklyGoals
        );
      }
    }
  } else if (hasOpenRouter) {
    try {
      console.log("Gemini Key not set. Trying to plan with OpenRouter API...");
      markdown = await generatePlanWithOpenRouter(
        targetDate,
        activeBacklogTasks,
        unfinishedWeeklyGoals,
        monthlyGoals
      );
    } catch (openRouterError) {
      console.error("OpenRouter API call failed:", openRouterError);
      markdown = generatePlanDeterministic(
        targetDate,
        todayTasksDeterministic,
        unfinishedWeeklyGoals
      );
    }
  } else {
    markdown = generatePlanDeterministic(
      targetDate,
      todayTasksDeterministic,
      unfinishedWeeklyGoals
    );
  }

  // 4. Save to GitHub: Daily/YYYY-MM-DD.md
  const filePath = `Daily/${targetDate}.md`;
  await createOrUpdateFile(
    filePath,
    markdown,
    `docs(daily): automatic daily plan generation for ${targetDate}`
  );

  const { dailyFocus, tasks } = parseDailyPlanMarkdown(markdown, filePath);

  return {
    date: targetDate,
    weeklyGoals,
    monthlyGoals,
    tasks,
    dailyFocus,
    markdown,
  };
}

/**
 * Fallback deterministic planning logic (no AI).
 * Orders tasks by priority.
 */
function generatePlanDeterministic(
  date: string,
  tasks: TaskItem[],
  weeklyGoals: GoalItem[]
): string {
  const uuid = randomUUID();
  const priorityOrder = { high: 1, medium: 2, low: 3, undefined: 4 };
  const sortedTasks = [...tasks].sort((a, b) => {
    const prioA = priorityOrder[a.priority ?? "undefined"];
    const prioB = priorityOrder[b.priority ?? "undefined"];
    return prioA - prioB;
  });

  const goalsList =
    weeklyGoals.length > 0
      ? weeklyGoals.map((g) => `- [ ] ${g.title}`).join("\n")
      : "- [ ] Primary daily goal / focus area";

  const tasksList =
    sortedTasks.length > 0
      ? sortedTasks
          .map((t) => `- [ ] ${t.title}`)
          .join("\n")
      : "- [ ] Practice DSA on Leetcode\n- [ ] Update and push projects on GitHub";

  return `---
id: "${uuid}"
type: daily
date: "${date}"
status: active
tags: [daily-log]
ai_processed: false
ai_metadata:
  last_sync: null
  summary: null
  mood_score: null
  productivity_score: null
---

# Daily Log: ${date}

## 📅 Daily Focus
<!-- AI_FOCUS_START -->
${goalsList}
<!-- AI_FOCUS_END -->

## 📈 AI Scheduled Tasks
<!-- AI_SCHEDULED_TASKS_START -->
${tasksList}
<!-- AI_SCHEDULED_TASKS_END -->

## 📝 Captured Notes & Logs
<!-- AI_LOGS_START -->
- Use this section to record thoughts, quick logs, and links captured during the day.
<!-- AI_LOGS_END -->

## 📊 Metrics
- **Energy Level**: 1-10
- **Focus Level**: 1-10
- **Screen Time**: minutes

## 🤖 AI Daily Digest & Next Actions
<!-- AI_DIGEST_START -->
*To be populated by AI agent during daily review.*
<!-- AI_DIGEST_END -->
`;
}

/**
 * Generates daily plan with Gemini model.
 */
async function generatePlanWithAI(
  date: string,
  tasks: TaskItem[],
  weeklyGoals: GoalItem[],
  monthlyGoals: GoalItem[]
): Promise<string> {
  const uuid = randomUUID();
  const prompt = `You are a senior productivity coach and scheduler. Generate today's daily log markdown for date ${date}.
You MUST generate markdown matching the following template structure EXACTLY. Fill in the specific items inside the comment blocks, but keep all frontmatter, headers, and comments intact:

---
id: "${uuid}"
type: daily
date: "${date}"
status: active
tags: [daily-log]
ai_processed: false
ai_metadata:
  last_sync: null
  summary: null
  mood_score: null
  productivity_score: null
---

# Daily Log: ${date}

## 📅 Daily Focus
<!-- AI_FOCUS_START -->
[Include goals synthesized from the weekly goals here as checklist items - e.g. - [ ] Goal name]
<!-- AI_FOCUS_END -->

## 📈 AI Scheduled Tasks
<!-- AI_SCHEDULED_TASKS_START -->
[Include tasks selected from the unfinished backlog list that are relevant to the weekly goals. Keep it extremely simple as a checklist - e.g. - [ ] Practice DSA on Leetcode]
<!-- AI_SCHEDULED_TASKS_END -->

## 📝 Captured Notes & Logs
<!-- AI_LOGS_START -->
- Use this section to record thoughts, quick logs, and links captured during the day.
<!-- AI_LOGS_END -->

## 📊 Metrics
- **Energy Level**: 1-10
- **Focus Level**: 1-10
- **Screen Time**: minutes

## 🤖 AI Daily Digest & Next Actions
<!-- AI_DIGEST_START -->
*To be populated by AI agent during daily review.*
<!-- AI_DIGEST_END -->

Here is the user's current context:

### Unfinished Weekly Goals
${
  weeklyGoals.length > 0
    ? weeklyGoals.map((g) => `- ${g.title}`).join("\n")
    : "None"
}

### Active Monthly Goals
${
  monthlyGoals.length > 0
    ? monthlyGoals.map((g) => `- ${g.title}`).join("\n")
    : "None"
}

### Unfinished Tasks
${
  tasks.length > 0
    ? tasks
        .map(
          (t) =>
            `- ${t.title} [Priority: ${t.priority || "none"}] [Source: ${
              t.sourceFile
            }] [ID: ${t.id}]`
        )
        .join("\n")
    : "None"
}

Return ONLY the raw markdown content. Do NOT wrap in markdown code blocks (\`\`\`markdown ... \`\`\`), do NOT write any introductory or concluding text. Start directly with the frontmatter "---".`;

  const response = await gemini.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
  });

  const textOutput = response.text?.trim();

  if (textOutput?.startsWith("```")) {
    return textOutput
      .replace(/^```[a-zA-Z]*\r?\n/, "")
      .replace(/\r?\n```$/, "")
      .trim();
  }

  return textOutput || generatePlanDeterministic(date, tasks, weeklyGoals);
}

/**
 * Generates daily plan using OpenRouter's API as a fallback.
 */
async function generatePlanWithOpenRouter(
  date: string,
  tasks: TaskItem[],
  weeklyGoals: GoalItem[],
  monthlyGoals: GoalItem[]
): Promise<string> {
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (!openRouterKey) {
    throw new Error("OPENROUTER_API_KEY is not defined");
  }

  const uuid = randomUUID();
  const prompt = `You are a senior productivity coach and scheduler. Generate today's daily log markdown for date ${date}.
You MUST generate markdown matching the following template structure EXACTLY. Fill in the specific items inside the comment blocks, but keep all frontmatter, headers, and comments intact:

---
id: "${uuid}"
type: daily
date: "${date}"
status: active
tags: [daily-log]
ai_processed: false
ai_metadata:
  last_sync: null
  summary: null
  mood_score: null
  productivity_score: null
---

# Daily Log: ${date}

## 📅 Daily Focus
<!-- AI_FOCUS_START -->
[Include goals synthesized from the weekly goals here as checklist items - e.g. - [ ] Goal name]
<!-- AI_FOCUS_END -->

## 📈 AI Scheduled Tasks
<!-- AI_SCHEDULED_TASKS_START -->
[Include tasks selected from the unfinished backlog list that are relevant to the weekly goals. Keep it extremely simple as a checklist - e.g. - [ ] Practice DSA on Leetcode]
<!-- AI_SCHEDULED_TASKS_END -->

## 📝 Captured Notes & Logs
<!-- AI_LOGS_START -->
- Use this section to record thoughts, quick logs, and links captured during the day.
<!-- AI_LOGS_END -->

## 📊 Metrics
- **Energy Level**: 1-10
- **Focus Level**: 1-10
- **Screen Time**: minutes

## 🤖 AI Daily Digest & Next Actions
<!-- AI_DIGEST_START -->
*To be populated by AI agent during daily review.*
<!-- AI_DIGEST_END -->

Here is the user's current context:

### Unfinished Weekly Goals
${
  weeklyGoals.length > 0
    ? weeklyGoals.map((g) => `- ${g.title}`).join("\n")
    : "None"
}

### Active Monthly Goals
${
  monthlyGoals.length > 0
    ? monthlyGoals.map((g) => `- ${g.title}`).join("\n")
    : "None"
}

### Unfinished Tasks
${
  tasks.length > 0
    ? tasks
        .map(
          (t) =>
            `- ${t.title} [Priority: ${t.priority || "none"}] [Source: ${
              t.sourceFile
            }] [ID: ${t.id}]`
        )
        .join("\n")
    : "None"
}

Return ONLY the raw markdown content. Do NOT wrap in markdown code blocks (\`\`\`markdown ... \`\`\`), do NOT write any introductory or concluding text. Start directly with the frontmatter "---".`;

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openRouterKey}`,
    },
    body: JSON.stringify({
      model: "openrouter/free",
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter API responded with status ${response.status}`);
  }

  const data = await response.json();
  const textOutput = data.choices?.[0]?.message?.content?.trim();

  if (textOutput?.startsWith("```")) {
    return textOutput
      .replace(/^```[a-zA-Z]*\r?\n/, "")
      .replace(/\r?\n```$/, "")
      .trim();
  }

  return textOutput || generatePlanDeterministic(date, tasks, weeklyGoals);
}

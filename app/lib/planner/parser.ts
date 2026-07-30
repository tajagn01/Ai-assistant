import { TaskItem, GoalItem } from "@/app/types/planner";

/**
 * Extracts tags from a text string.
 * Tags start with '#' followed by alphanumeric characters/hyphens/underscores/slashes.
 */
export function extractTags(text: string): string[] {
  const tagRegex = /#([\w-/]+)/g;
  const tags: string[] = [];
  let match;
  // Use a copy of regex to reset state
  const regex = new RegExp(tagRegex);
  while ((match = regex.exec(text)) !== null) {
    tags.push(match[1]);
  }
  return tags;
}

/**
 * Extracts priority from a text string or its tags.
 */
export function extractPriority(
  text: string,
  tags: string[]
): "high" | "medium" | "low" | undefined {
  const lowercaseText = text.toLowerCase();

  // Check tags first
  if (
    tags.some(
      (t) =>
        t.toLowerCase() === "high" ||
        t.toLowerCase() === "priority/high" ||
        t.toLowerCase() === "p1"
    )
  ) {
    return "high";
  }
  if (
    tags.some(
      (t) =>
        t.toLowerCase() === "medium" ||
        t.toLowerCase() === "priority/medium" ||
        t.toLowerCase() === "p2"
    )
  ) {
    return "medium";
  }
  if (
    tags.some(
      (t) =>
        t.toLowerCase() === "low" ||
        t.toLowerCase() === "priority/low" ||
        t.toLowerCase() === "p3"
    )
  ) {
    return "low";
  }

  // Check text indicators
  if (
    lowercaseText.includes("[priority:: high]") ||
    lowercaseText.includes("🔥") ||
    lowercaseText.includes("(a)")
  ) {
    return "high";
  }
  if (
    lowercaseText.includes("[priority:: medium]") ||
    lowercaseText.includes("⚡") ||
    lowercaseText.includes("(b)")
  ) {
    return "medium";
  }
  if (
    lowercaseText.includes("[priority:: low]") ||
    lowercaseText.includes("💤") ||
    lowercaseText.includes("(c)")
  ) {
    return "low";
  }

  return undefined;
}

/**
 * Parses a markdown string and extracts checklist tasks.
 * Matches: - [ ] Task, * [x] Task, - [/] Task
 */
export function parseTasks(markdown: string, sourceFile: string): TaskItem[] {
  const lines = markdown.split(/\r?\n/);
  const tasks: TaskItem[] = [];

  // Match optional indentation, list indicator, bracket status, and title text
  const taskRegex = /^\s*[-*+]\s+\[([ xX/])\]\s+(.+)$/;

  lines.forEach((line, index) => {
    const match = line.match(taskRegex);
    if (match) {
      const statusChar = match[1];
      const rawText = match[2];

      const tags = extractTags(rawText);
      const priority = extractPriority(rawText, tags);

      // Extract due date (looks for [due::YYYY-MM-DD])
      const dueMatch = rawText.match(/\[due::([\d-]+)\]/);
      const dueDate = dueMatch ? dueMatch[1] : undefined;

      // Extract blocked/recurring flags
      const blocked = rawText.includes("blocked_by::");
      const recurring = rawText.includes("recurring::");

      // Clean title removes tags, metadata brackets, and HTML comments
      let title = rawText;
      tags.forEach((tag) => {
        title = title.replace(`#${tag}`, "");
      });
      title = title.replace(/\[[^\]]+\]/g, "");
      title = title.replace(/<!--.*?-->/g, "");
      title = title.replace(/\s+/g, " ").trim();

      tasks.push({
        id: `${sourceFile}-${index}`,
        title,
        completed: statusChar.toLowerCase() === "x",
        priority,
        tags,
        sourceFile,
        rawLine: line,
        dueDate,
        blocked,
        recurring,
      });
    }
  });

  return tasks;
}

/**
 * Parses markdown string for goals. Only parses checklist and list items under
 * objectives, themes, focus, or goal headers.
 */
export function parseGoals(
  markdown: string,
  type: "weekly" | "monthly"
): GoalItem[] {
  const lines = markdown.split(/\r?\n/);
  const goals: GoalItem[] = [];

  let inGoalsSection = false;

  const headerRegex = /^#+\s+(.+)$/;
  const taskRegex = /^\s*[-*+]\s+\[([ xX/])\]\s+(.+)$/;
  const listRegex = /^\s*[-*+]\s+(?![[\]])(.+)$/;

  lines.forEach((line, index) => {
    // Check if we hit a header
    const headerMatch = line.match(headerRegex);
    if (headerMatch) {
      const headerTitle = headerMatch[1].toLowerCase();
      // Enable parsing only for specific sections
      if (
        headerTitle.includes("objective") ||
        headerTitle.includes("theme") ||
        headerTitle.includes("focus") ||
        headerTitle.includes("goal")
      ) {
        inGoalsSection = true;
      } else {
        inGoalsSection = false;
      }
      return;
    }

    if (!inGoalsSection) {
      return; // Skip items outside the goals/objectives sections
    }

    const taskMatch = line.match(taskRegex);
    if (taskMatch) {
      const statusChar = taskMatch[1];
      let title = taskMatch[2];
      title = title.replace(/\[\w+::[^\]]+\]/g, "");
      title = title.replace(/\s+/g, " ").trim();
      goals.push({
        id: `${type}-${index}`,
        title,
        completed: statusChar.toLowerCase() === "x",
        type,
        rawLine: line,
      });
    } else {
      const listMatch = line.match(listRegex);
      if (listMatch) {
        let title = listMatch[1];
        title = title.replace(/\[\w+::[^\]]+\]/g, "");
        title = title.replace(/\s+/g, " ").trim();
        // Skip header lines or rule lines
        if (
          title &&
          !title.startsWith("#") &&
          !title.startsWith("---") &&
          !title.includes("==")
        ) {
          goals.push({
            id: `${type}-${index}`,
            title,
            completed: false,
            type,
            rawLine: line,
          });
        }
      }
    }
  });

  return goals;
}

export interface ParsedDailyPlan {
  dailyFocus: string[];
  tasks: TaskItem[];
}

/**
 * Parses the generated daily plan markdown, separating focus items and scheduled tasks.
 */
export function parseDailyPlanMarkdown(
  markdown: string,
  sourceFile: string
): ParsedDailyPlan {
  const lines = markdown.split(/\r?\n/);
  const dailyFocus: string[] = [];
  const tasks: TaskItem[] = [];

  let currentSection = "";
  const headerRegex = /^#+\s+(.+)$/;
  const taskRegex = /^\s*[-*+]\s+\[([ xX/])\]\s+(.+)$/;

  lines.forEach((line, index) => {
    const headerMatch = line.match(headerRegex);
    if (headerMatch) {
      currentSection = headerMatch[1].toLowerCase();
      return;
    }

    const taskMatch = line.match(taskRegex);
    if (taskMatch) {
      const statusChar = taskMatch[1];
      const rawText = taskMatch[2];

      // Clean title removes tags, metadata brackets, and HTML comments
      let title = rawText;
      const tags = extractTags(rawText);
      tags.forEach((tag) => {
        title = title.replace(`#${tag}`, "");
      });
      title = title.replace(/\[[^\]]+\]/g, "");
      title = title.replace(/<!--.*?-->/g, "");
      title = title.replace(/\s+/g, " ").trim();

      if (currentSection.includes("focus")) {
        dailyFocus.push(title);
      } else if (currentSection.includes("task")) {
        const priority = extractPriority(rawText, tags);
        const dueMatch = rawText.match(/\[due::([\d-]+)\]/);
        const dueDate = dueMatch ? dueMatch[1] : undefined;
        const blocked = rawText.includes("blocked_by::");
        const recurring = rawText.includes("recurring::");

        tasks.push({
          id: `${sourceFile}-${index}`,
          title,
          completed: statusChar.toLowerCase() === "x",
          priority,
          tags,
          sourceFile,
          rawLine: line,
          dueDate,
          blocked,
          recurring,
        });
      }
    }
  });

  return { dailyFocus, tasks };
}

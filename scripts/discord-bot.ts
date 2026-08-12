import { getDiscordClient, discordConfig } from "@/app/lib/discord/client";
import { registerCommands } from "@/app/lib/discord/commands";
import { formatPlanEmbed } from "@/app/lib/discord/embeds";
import { generateDailyPlan, getLocalDateString } from "@/app/lib/planner/generator";
import { readFile } from "@/app/lib/github/read";
import { createOrUpdateFile } from "@/app/lib/github/write";
import { listFolder } from "@/app/lib/github/list";
import { Client, TextChannel } from "discord.js";
import http from "http";

const nudgeMessages = [
  "Hey! How's your progress going today? Did you get a chance to work on your goals? 🚀",
  "Quick check-in! What task are you working on right now? 📝",
  "Just wanted to nudge you—how is today's task list coming along? You got this! 💪",
  "Hey there! Any updates on your daily focus/tasks? Let me know how it's going! ✨",
  "Quick progress check! Which tasks have you knocked off the list so far? 🎯",
  "Friendly reminder to log your progress! How's everything tracking? 📈",
  "Hey! Hope you're having a productive day. What's the latest update on your goals? 🌟"
];

function getRandomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function resolveWeeklyGoalsPath(targetDate: string): Promise<string | null> {
  const dateObj = new Date(targetDate);
  const startOfYear = new Date(dateObj.getFullYear(), 0, 1);
  const pastDaysOfYear = (dateObj.getTime() - startOfYear.getTime()) / 86400000;
  const weekNum = Math.ceil((pastDaysOfYear + startOfYear.getDay() + 1) / 7);
  const year = dateObj.getFullYear();
  const formattedWeekNum = String(weekNum).padStart(2, "0");

  const pathsToCheck = [
    `Goals/Weekly/${year}-W${formattedWeekNum}.md`,
    `Goals/Weekly/${year}-Www.md`,
    `Goals/Weekly.md`
  ];

  for (const p of pathsToCheck) {
    try {
      await readFile(p);
      return p;
    } catch {}
  }

  // Fallback: list folder
  try {
    const folderFiles = await listFolder("Goals/Weekly");
    if (Array.isArray(folderFiles) && folderFiles.length > 0) {
      const mdFile = folderFiles.find(
        (f: any) => f.type === "file" && f.name.endsWith(".md")
      );
      if (mdFile) return mdFile.path;
    }
  } catch {}

  return null;
}

function startProactiveNudger(client: Client) {
  const channelId = process.env.DISCORD_CHANNEL_ID;
  if (!channelId) {
    console.warn("[Nudger] DISCORD_CHANNEL_ID not configured. Proactive nudging disabled.");
    return;
  }

  let lastNudgeDate: string = "";
  let nudgeSlotsSent: number[] = [];
  let targetHour1 = getRandomInt(13, 16); // 1:00 PM - 4:59 PM IST
  let targetHour2 = getRandomInt(17, 21); // 5:00 PM - 9:59 PM IST

  console.log(`[Nudger] Initialized. Today's target slots: ${targetHour1} and ${targetHour2}`);

  // Run check every 15 minutes
  setInterval(async () => {
    try {
      const now = new Date();
      const dateParts = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "numeric",
        hour12: false
      }).formatToParts(now);

      const year = dateParts.find((p) => p.type === "year")?.value;
      const month = dateParts.find((p) => p.type === "month")?.value;
      const day = dateParts.find((p) => p.type === "day")?.value;
      const hourStr = dateParts.find((p) => p.type === "hour")?.value;

      if (!year || !month || !day || !hourStr) return;

      const todayStr = `${year}-${month}-${day}`;
      const currentHour = parseInt(hourStr, 10);

      // Reset slots if day changed
      if (todayStr !== lastNudgeDate) {
        lastNudgeDate = todayStr;
        nudgeSlotsSent = [];
        targetHour1 = getRandomInt(13, 16);
        targetHour2 = getRandomInt(17, 21);
        console.log(`[Nudger] New day (${todayStr}) reset. Target hours for today: ${targetHour1} and ${targetHour2}`);
      }

      let shouldSend = false;
      let slotId = 0;

      if (currentHour === targetHour1 && !nudgeSlotsSent.includes(1)) {
        shouldSend = true;
        slotId = 1;
      } else if (currentHour === targetHour2 && !nudgeSlotsSent.includes(2)) {
        shouldSend = true;
        slotId = 2;
      }

      if (shouldSend) {
        nudgeSlotsSent.push(slotId);
        const randomMessage = nudgeMessages[Math.floor(Math.random() * nudgeMessages.length)];
        const channel = await client.channels.fetch(channelId);
        if (channel && channel.isTextBased()) {
          console.log(`[Nudger] Sending nudge: "${randomMessage}"`);
          await (channel as TextChannel).send(randomMessage);
        }
      }
    } catch (err) {
      console.error("[Nudger] Error running check loop:", err);
    }
  }, 15 * 60 * 1000);
}

async function main() {
  const { token } = discordConfig;

  if (!token) {
    console.error("DISCORD_BOT_TOKEN environment variable is not defined.");
    process.exit(1);
  }

  // Start a dummy HTTP server to bind to $PORT. 
  // This passes the health check for free cloud hosting platforms like Render or Koyeb.
  const port = process.env.PORT || 3000;
  http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Discord Bot is online!");
  }).listen(port, () => {
    console.log(`Dummy health check server listening on port ${port}`);
  });

  // 1. Automatically register slash commands at startup
  try {
    await registerCommands();
  } catch (err) {
    console.error("Failed to register Discord commands:", err);
  }

  // 2. Initialize Discord Client
  const client = getDiscordClient();

  client.on("ready", () => {
    console.log(`🚀 Discord Bot is online and logged in as ${client.user?.tag}`);
    startProactiveNudger(client);
  });

  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    try {
      if (commandName === "ping") {
        await interaction.reply({ content: "Bot is online.", ephemeral: true });
      } else if (commandName === "today") {
        // Defer response to handle network latency with GitHub API
        await interaction.deferReply();

        console.log("Generating daily plan via /today slash command...");
        const plan = await generateDailyPlan();
        const embed = formatPlanEmbed(plan);

        await interaction.editReply({ embeds: [embed] });
      } else if (commandName === "completed") {
        await interaction.deferReply();

        const targetDate = getLocalDateString();
        const filePath = `Daily/${targetDate}.md`;

        let fileContent = "";
        try {
          fileContent = await readFile(filePath);
        } catch {
          await interaction.editReply({
            content: `❌ No daily log file found for today (${targetDate}) in your vault. Generate it first using \`/today\`!`,
          });
          return;
        }

        const taskQuery = interaction.options.getString("task");
        const lines = fileContent.split(/\r?\n/);
        let updatedCount = 0;
        const completedTasks: string[] = [];

        const updatedLines = lines.map((line) => {
          // Match uncompleted checkbox pattern: - [ ] Title
          const match = line.match(/^(\s*[-*+]\s+\[) (\]\s+)(.+)$/);
          if (match) {
            const prefix = match[1];
            const suffix = match[2];
            const taskTitle = match[3];

            // Filter out comment lines or format details
            if (taskTitle.startsWith("<!--") || taskTitle.startsWith("Use this section")) {
              return line;
            }

            if (taskQuery) {
              if (taskTitle.toLowerCase().includes(taskQuery.toLowerCase())) {
                updatedCount++;
                completedTasks.push(taskTitle);
                return `${prefix}x${suffix}${taskTitle}`;
              }
            } else {
              updatedCount++;
              completedTasks.push(taskTitle);
              return `${prefix}x${suffix}${taskTitle}`;
            }
          }
          return line;
        });

        if (updatedCount === 0) {
          await interaction.editReply({
            content: taskQuery
              ? `❌ No uncompleted tasks found matching: **"${taskQuery}"**`
              : `🎉 All tasks in today's daily log are already completed!`,
          });
          return;
        }

        // Save Daily Log changes
        const newContent = updatedLines.join("\n");
        await createOrUpdateFile(
          filePath,
          newContent,
          `docs(daily): mark tasks as completed via Discord bot`
        );

        // Also check and update the corresponding Weekly Goals file!
        const weeklyPath = await resolveWeeklyGoalsPath(targetDate);
        let weeklyGoalsUpdated = 0;
        const completedWeeklyGoals: string[] = [];

        if (weeklyPath) {
          try {
            const weeklyContent = await readFile(weeklyPath);
            const weeklyLines = weeklyContent.split(/\r?\n/);
            
            const updatedWeeklyLines = weeklyLines.map((line) => {
              const match = line.match(/^(\s*[-*+]\s+\[) (\]\s+)(.+)$/);
              if (match) {
                const prefix = match[1];
                const suffix = match[2];
                const goalTitle = match[3];

                // See if this goal matches any of the completed daily tasks/focuses
                const wasCompleted = completedTasks.some((task) => {
                  const tLower = task.toLowerCase();
                  const gLower = goalTitle.toLowerCase();
                  return tLower.includes(gLower) || gLower.includes(tLower);
                });

                if (wasCompleted) {
                  weeklyGoalsUpdated++;
                  completedWeeklyGoals.push(goalTitle);
                  return `${prefix}x${suffix}${goalTitle}`;
                }
              }
              return line;
            });

            if (weeklyGoalsUpdated > 0) {
              const newWeeklyContent = updatedWeeklyLines.join("\n");
              await createOrUpdateFile(
                weeklyPath,
                newWeeklyContent,
                `docs(weekly): update goals completed via Discord bot`
              );
            }
          } catch (weeklyErr) {
            console.error("Failed to update weekly goals:", weeklyErr);
          }
        }

        // Format nice success response
        let replyMessage = `✅ Successfully marked ${updatedCount} task(s) as completed for today (**${targetDate}**):\n`;
        replyMessage += completedTasks.map((t) => `• ~~${t}~~`).join("\n");
        
        if (weeklyGoalsUpdated > 0) {
          replyMessage += `\n\n🎯 **Also updated ${weeklyGoalsUpdated} Weekly Goal(s) in your vault:**\n`;
          replyMessage += completedWeeklyGoals.map((g) => `• ~~${g}~~`).join("\n");
        }

        await interaction.editReply({
          content: replyMessage,
        });
      }
    } catch (err: any) {
      console.error(`Error handling slash command /${commandName}:`, err);
      const errorMessage = `❌ Failed to execute command: ${
        err.message || String(err)
      }`;

      if (interaction.deferred) {
        await interaction.editReply({ content: errorMessage });
      } else if (interaction.replied) {
        await interaction.followUp({ content: errorMessage, ephemeral: true });
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      }
    }
  });

  // Login WebSocket Client
  client.login(token);
}

main().catch((err) => {
  console.error("Fatal error starting Discord bot daemon:", err);
  process.exit(1);
});

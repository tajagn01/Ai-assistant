import { getDiscordClient, discordConfig } from "@/app/lib/discord/client";
import { registerCommands } from "@/app/lib/discord/commands";
import { formatPlanEmbed } from "@/app/lib/discord/embeds";
import { generateDailyPlan, getLocalDateString } from "@/app/lib/planner/generator";
import { readFile } from "@/app/lib/github/read";
import { createOrUpdateFile } from "@/app/lib/github/write";
import http from "http";

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

        const newContent = updatedLines.join("\n");
        await createOrUpdateFile(
          filePath,
          newContent,
          `docs(daily): mark tasks as completed via Discord bot`
        );

        const taskBulletPoints = completedTasks.map((t) => `• ~~${t}~~`).join("\n");
        await interaction.editReply({
          content: `✅ Successfully marked ${updatedCount} task(s) as completed for today (**${targetDate}**):\n${taskBulletPoints}`,
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

import { getDiscordClient, discordConfig } from "@/app/lib/discord/client";
import { registerCommands } from "@/app/lib/discord/commands";
import { formatPlanEmbed } from "@/app/lib/discord/embeds";
import { generateDailyPlan } from "@/app/lib/planner/generator";

async function main() {
  const { token } = discordConfig;

  if (!token) {
    console.error("DISCORD_BOT_TOKEN environment variable is not defined.");
    process.exit(1);
  }

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

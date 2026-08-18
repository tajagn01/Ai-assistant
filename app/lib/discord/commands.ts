import { SlashCommandBuilder, Routes } from "discord.js";
import { discordConfig, getDiscordRest } from "./client";

// Define the commands to register
export const commands = [
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check if the bot is online"),
  new SlashCommandBuilder()
    .setName("today")
    .setDescription("Generate and retrieve today's daily plan"),
  new SlashCommandBuilder()
    .setName("completed")
    .setDescription("Mark tasks as completed in today's daily log")
    .addStringOption((option) =>
      option
        .setName("task")
        .setDescription("Specific task name to complete (omit to complete all)")
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName("weekly-goal")
    .setDescription("Add a new weekly goal to your Obsidian vault")
    .addStringOption((option) =>
      option
        .setName("goal")
        .setDescription("The weekly goal description to add")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("week")
        .setDescription("Target week (e.g. 2026-W34). Defaults to current week")
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName("monthly-goal")
    .setDescription("Add a new monthly goal to your Obsidian vault")
    .addStringOption((option) =>
      option
        .setName("goal")
        .setDescription("The monthly goal description to add")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("month")
        .setDescription("Target month (e.g. 2026-08). Defaults to current month")
        .setRequired(false)
    ),
].map((command) => command.toJSON());

/**
 * Registers slash commands for the specified Guild (private server) or globally.
 */
export async function registerCommands() {
  const { clientId, guildId } = discordConfig;

  if (!clientId) {
    throw new Error("DISCORD_CLIENT_ID environment variable is not defined");
  }

  const rest = getDiscordRest();

  try {
    console.log("Started refreshing application (/) commands.");

    if (guildId) {
      // Guild commands are registered instantly (ideal for private servers)
      await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: commands }
      );
      console.log(`Successfully reloaded (/) commands for guild ${guildId}.`);
    } else {
      // Global commands (takes ~1 hour to propagate)
      await rest.put(Routes.applicationCommands(clientId), {
        body: commands,
      });
      console.log("Successfully reloaded (/) commands globally.");
    }
  } catch (error) {
    console.error("Error registering Discord slash commands:", error);
    throw error;
  }
}

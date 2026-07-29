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

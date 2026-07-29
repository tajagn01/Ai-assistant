import { Client, GatewayIntentBits, REST } from "discord.js";

const token = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;
const channelId = process.env.DISCORD_CHANNEL_ID;

/**
 * Creates and configures a Discord Client instance with necessary intents.
 */
export function getDiscordClient(): Client {
  if (!token) {
    throw new Error("DISCORD_BOT_TOKEN environment variable is not defined");
  }

  return new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
    ],
  });
}

/**
 * Creates and configures a Discord REST instance.
 */
export function getDiscordRest(): REST {
  if (!token) {
    throw new Error("DISCORD_BOT_TOKEN environment variable is not defined");
  }

  return new REST({ version: "10" }).setToken(token);
}

export const discordConfig = {
  token,
  clientId,
  guildId,
  channelId,
};

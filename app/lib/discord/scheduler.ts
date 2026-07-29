import { TextChannel } from "discord.js";
import { getDiscordClient, discordConfig } from "./client";
import { formatPlanEmbed } from "./embeds";
import { generateDailyPlan } from "@/app/lib/planner/generator";

/**
 * Generates today's daily plan, commits it to GitHub,
 * and pushes it as an embed to the configured Discord channel.
 */
export async function sendDailyPlanToDiscord(): Promise<void> {
  const { token, channelId } = discordConfig;

  if (!token || !channelId) {
    throw new Error(
      "DISCORD_BOT_TOKEN and DISCORD_CHANNEL_ID must be configured."
    );
  }

  // 1. Generate daily plan (this creates/updates Daily/YYYY-MM-DD.md in GitHub)
  const plan = await generateDailyPlan();

  // 2. Format into an embed
  const embed = formatPlanEmbed(plan);

  // 3. Login to client, send message, and cleanup
  const client = getDiscordClient();

  return new Promise<void>((resolve, reject) => {
    client.on("ready", async () => {
      try {
        console.log(`Bot logged in as ${client.user?.tag} to dispatch daily plan.`);
        const channel = await client.channels.fetch(channelId);

        if (!channel) {
          throw new Error(`Discord channel with ID ${channelId} not found.`);
        }

        if (!channel.isTextBased()) {
          throw new Error("Specified Discord channel is not a text channel.");
        }

        await (channel as TextChannel).send({ embeds: [embed] });
        console.log("Daily plan pushed successfully to Discord.");
        client.destroy();
        resolve();
      } catch (err) {
        console.error("Error dispatching daily plan to Discord:", err);
        client.destroy();
        reject(err);
      }
    });

    client.on("error", (err) => {
      console.error("Discord client encountered an error:", err);
      client.destroy();
      reject(err);
    });

    client.login(token).catch((err) => {
      console.error("Failed to authenticate Discord client:", err);
      reject(err);
    });
  });
}

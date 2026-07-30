import { EmbedBuilder } from "discord.js";
import { DailyPlan } from "@/app/types/planner";

/**
 * Formats a DailyPlan object into a highly professional, clean, and simple Discord Embed.
 * Lists all active tasks under a single unified section without directory categories.
 */
export function formatPlanEmbed(plan: DailyPlan): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`📅 Today's Plan - ${plan.date}`)
    .setColor(0x5865f2) // Discord Blurple color
    .setTimestamp();

  // 1. Focus / Weekly Goals Section
  const unfinishedWeeklyGoals = plan.weeklyGoals.filter((g) => !g.completed);
  if (unfinishedWeeklyGoals.length > 0) {
    embed.addFields({
      name: "🎯 Focus / Weekly Goals",
      value: unfinishedWeeklyGoals.map((g) => `• ${g.title}`).join("\n"),
      inline: false,
    });
  }

  // 2. Today's Tasks Section (Unified simple list of focus items and backlog tasks)
  const activeTasks = plan.tasks.filter((t) => !t.completed);
  const focusItems = plan.dailyFocus || [];

  if (activeTasks.length === 0 && focusItems.length === 0) {
    embed.setDescription("🎉 No tasks scheduled for today!");
  } else {
    const focusList = focusItems.map((item) => `• ${item}`);
    const tasksList = activeTasks.map((task) => {
      const priorityIndicator =
        task.priority === "high"
          ? " 🔥"
          : task.priority === "medium"
          ? " ⚡"
          : "";
      return `• ${task.title}${priorityIndicator}`;
    });
    const unifiedList = [...focusList, ...tasksList].join("\n");

    embed.addFields({
      name: "📋 Today's Tasks",
      value: unifiedList,
      inline: false,
    });
  }

  return embed;
}

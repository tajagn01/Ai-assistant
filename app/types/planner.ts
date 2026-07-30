export interface TaskItem {
  id: string;
  title: string;
  completed: boolean;
  priority?: "high" | "medium" | "low";
  tags: string[];
  sourceFile: string;
  rawLine: string;
  dueDate?: string; // YYYY-MM-DD
  blocked?: boolean;
  recurring?: boolean;
}

export interface GoalItem {
  id: string;
  title: string;
  completed: boolean;
  type: "weekly" | "monthly";
  rawLine: string;
}

export interface DailyPlan {
  date: string; // YYYY-MM-DD
  weeklyGoals: GoalItem[];
  monthlyGoals: GoalItem[];
  tasks: TaskItem[];
  markdown: string;
  dailyFocus?: string[]; // Synthesized daily focus goals for the day
}

export type Priority = "low" | "medium" | "high";
export type Frequency = "daily" | "weekly" | "monthly" | "interval" | "once";
export type VpdmArea = "main" | "comments";

export type TaskDTO = {
  id: number;
  title: string;
  notes: string;
  priority: Priority;
  frequency: Frequency;
  startDate: string;
  endDate: string | null;
  /// Weekly recurrence: "Sunday"..."Saturday"
  repeatWeekday: string | null;
  /// Monthly recurrence: 1-31
  repeatDayOfMonth: number | null;
  /// Interval recurrence: every N days (e.g. 15)
  repeatIntervalDays: number | null;
  createdAt: string;
  updatedAt: string;
  category: string | null;
  vpdmArea: VpdmArea;
};

export type ImportedTask = TaskDTO;

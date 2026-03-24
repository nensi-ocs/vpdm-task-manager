export type Priority = "low" | "medium" | "high";
export type Frequency = "daily" | "weekly" | "monthly";

export type Task = {
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
  createdAt: string;
  updatedAt: string;
  /** VPDM sheet section (e.g. Office, Tools) */
  category: string | null;
};

export type Filter = "all" | "active" | "done";

export type Category = {
  id: string;
  name: string;
  createdAt: string;
};

export type FollowupClient = {
  id: string;
  track: string;
  clientName: string;
  owner: string | null;
  createdAt: string;
};

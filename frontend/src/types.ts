export type Priority = "low" | "medium" | "high";
export type Frequency = "daily" | "weekly" | "monthly" | "interval" | "once";
export type VpdmArea = "main" | "comments";

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
  /// Interval recurrence: every N days (e.g. 15)
  repeatIntervalDays: number | null;
  createdAt: string;
  updatedAt: string;
  /** VPDM sheet section (e.g. Office, Tools) */
  category: string | null;
  /** VPDM daily sheet placement */
  vpdmArea: VpdmArea;
};

export type TaskUpsertPayload = Omit<Task, "id" | "createdAt" | "updatedAt" | "endDate">;

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

export type PipelineStage = {
  key: string;
  label: string;
  order: number;
};

export type PipelineClient = {
  id: string;
  clientName: string;
  source: string;
  stage: string;
  stageLabel: string;
  stageOrder: number;
  lostReason: string | null;
  createdAt: string;
  updatedAt: string;
};

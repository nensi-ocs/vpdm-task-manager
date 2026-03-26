import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "./auth/AuthContext";
import type { Frequency, Priority, Task, TaskUpsertPayload } from "./types";
import { useCategories } from "./useCategories";
import { useFollowupClients } from "./useFollowupClients";
import { useTasks } from "./useTasks";
import { apiGetBlob } from "./api";
import { toastApiError, toastSuccess } from "./toast";
import {
  VPDM_TRACKS,
} from "./vpdmCatalog";
import "./TaskBoard.css";
import { FileSpreadsheet, Printer, X } from "lucide-react";
import { Pagination } from "./components/Pagination";
import {
  formatTaskOccurrenceDateLabel,
  formatTaskCompletedDateLabel,
  getTaskCompletedIsoForSelectedWindow,
  isTaskVisibleWithCarryForward,
  WEEKDAYS,
} from "./taskSchedule";

function defaultWeekday(): (typeof WEEKDAYS)[number] {
  return WEEKDAYS[new Date().getDay()];
}

function ymdInKolkata(date: Date): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${day}`;
}

function todayIsoKolkata(): string {
  return ymdInKolkata(new Date());
}

function defaultDayOfMonth(): string {
  return String(new Date().getDate());
}

type ModalState = {
  open: boolean;
  mode: "create" | "edit";
  editId: number | null;
  title: string;
  category: string;
  frequency: Frequency;
  startDate: string;
  repeatWeekday: (typeof WEEKDAYS)[number];
  repeatDayOfMonth: string;
  repeatIntervalDays: string;
};

function defaultIntervalDays(): string {
  return "15";
}

function emptyModal(frequency: Frequency): ModalState {
  const today = todayIsoKolkata();
  return {
    open: false,
    mode: "create",
    editId: null,
    title: "",
    category: "",
    frequency,
    startDate: today,
    repeatWeekday: defaultWeekday(),
    repeatDayOfMonth: defaultDayOfMonth(),
    repeatIntervalDays: defaultIntervalDays(),
  };
}

function sectionTitle(freq: Frequency): string {
  if (freq === "daily") return "Everyday Tasks";
  if (freq === "weekly") return "Weekly Tasks";
  if (freq === "monthly") return "Monthly Tasks";
  if (freq === "interval") return "Every X Days Tasks";
  return "One-Time Tasks";
}

function sectionBadge(freq: Frequency): string {
  if (freq === "daily") return "DAILY";
  if (freq === "weekly") return "WEEKLY";
  if (freq === "monthly") return "MONTHLY";
  if (freq === "interval") return "EVERY X DAYS";
  return "ONE-TIME";
}

function createModal(frequency: Frequency, defaultCategory: string): ModalState {
  return {
    ...emptyModal(frequency),
    category: defaultCategory,
    open: true,
  };
}

function sortForSection(list: Task[]): Task[] {
  return [...list].sort((a, b) => {
    return a.createdAt.localeCompare(b.createdAt);
  });
}

export function TaskBoard() {
  const { user } = useAuth();
  const [selectedDateIso, setSelectedDateIso] = useState<string>(() => todayIsoKolkata());
  const {
    tasks,
    loading,
    error,
    reload,
    clearError,
    addTask,
    updateTask,
    completedTaskIds,
    completionDatesByTaskId,
    setTaskCompletionForDate,
  } = useTasks(user?.id, selectedDateIso);
  const { categories } = useCategories(user?.id);
  const {
    grouped: followupGrouped,
    completedClientIds,
    setClientCompletionForDate,
  } = useFollowupClients(user?.id, selectedDateIso);

  const [modal, setModal] = useState<ModalState>(emptyModal("daily"));
  const visibleTasks = tasks;

  const tasksForSelectedDate = useCallback(
    (t: Task) =>
      isTaskVisibleWithCarryForward(t, selectedDateIso, completionDatesByTaskId),
    [selectedDateIso, completionDatesByTaskId]
  );
  const daily = useMemo(
    () =>
      sortForSection(
        visibleTasks.filter((t) => t.frequency === "daily" && tasksForSelectedDate(t))
      ),
    [tasksForSelectedDate, visibleTasks]
  );
  const weekly = useMemo(
    () =>
      sortForSection(
        visibleTasks.filter((t) => t.frequency === "weekly" && tasksForSelectedDate(t))
      ),
    [tasksForSelectedDate, visibleTasks]
  );
  const monthly = useMemo(
    () =>
      sortForSection(
        visibleTasks.filter((t) => t.frequency === "monthly" && tasksForSelectedDate(t))
      ),
    [tasksForSelectedDate, visibleTasks]
  );
  const interval = useMemo(
    () =>
      sortForSection(
        visibleTasks.filter((t) => t.frequency === "interval" && tasksForSelectedDate(t))
      ),
    [tasksForSelectedDate, visibleTasks]
  );
  const once = useMemo(
    () =>
      sortForSection(
        visibleTasks.filter((t) => t.frequency === "once" && tasksForSelectedDate(t))
      ),
    [tasksForSelectedDate, visibleTasks]
  );

  const categoryOptions = useMemo(() => {
    return [...categories.map((c) => c.name)].sort((a, b) => a.localeCompare(b));
  }, [categories]);

  function openCreate(frequency: Frequency) {
    setModal({
      ...createModal(frequency, categoryOptions[0] ?? ""),
      startDate: selectedDateIso,
    });
  }

  async function submitModal(e: FormEvent) {
    e.preventDefault();
    const title = modal.title.trim();
    if (!title) return;
    const payload: TaskUpsertPayload = {
      title,
      notes: "",
      priority: "medium" as Priority,
      frequency: modal.frequency,
      startDate: modal.startDate,
      repeatWeekday:
        modal.frequency === "weekly" ? modal.repeatWeekday : null,
      repeatDayOfMonth:
        modal.frequency === "monthly" ? Number(modal.repeatDayOfMonth) : null,
      repeatIntervalDays:
        modal.frequency === "interval" ? Number(modal.repeatIntervalDays) : null,
      category: modal.category.trim() || null,
    };
    if (modal.mode === "create") {
      await addTask(payload);
      toastSuccess("Task added");
    } else if (modal.editId) {
      await updateTask(modal.editId, payload);
      toastSuccess("Task updated");
    }
    setModal((prev) => ({ ...prev, open: false }));
  }

  async function toggleFollowup(clientId: string, checked: boolean) {
    await setClientCompletionForDate(clientId, selectedDateIso, checked);
  }

  async function exportDailySheetXlsx() {
    try {
      const blob = await apiGetBlob(
        `/export/daily-sheet?date=${encodeURIComponent(selectedDateIso)}`
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `VPDM Daily Task ${selectedDateIso.replace(/-/g, "")}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toastSuccess("Excel exported");
    } catch (e) {
      console.error(e);
      toastApiError(e, "Export failed");
    }
  }

  async function printDailySheetLikeExport() {
    try {
      const url = `/api/export/daily-sheet-print?date=${encodeURIComponent(
        selectedDateIso
      )}`;
      window.open(url, "_blank", "noopener,noreferrer");
      // if (!win) {
      //   toastApiError(
      //     new Error("Popup blocked. Please allow popups and try again.")
      //   );
      //   return;
      // }
      toastSuccess("Print view opened");
    } catch (e) {
      console.error(e);
      toastApiError(e, "Print failed");
    }
  }

  if (!user) {
    return null;
  }

  return (
    <div className="task-board">
      <header className="vpm-head">
        <div className="vpm-title">VPDM Task Manager</div>
        <div className="vpm-controls">
          <input
            className="date-picker"
            type="date"
            value={selectedDateIso}
            onChange={(e) => setSelectedDateIso(e.target.value)}
            aria-label="Select schedule date"
          />
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => void exportDailySheetXlsx()}
          >
            <FileSpreadsheet size={16} aria-hidden="true" />
            Excel
          </button>
          <button className="btn primary sm" onClick={() => void printDailySheetLikeExport()}>
            <Printer size={16} aria-hidden="true" />
            Print
          </button>
        </div>
      </header>

      {error ? (
        <div className="banner-error" role="alert">
          <span className="banner-text">{error}</span>
          <div className="banner-actions">
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => void reload()}
            >
              Retry
            </button>
            <button
              type="button"
              className="btn ghost sm"
              onClick={clearError}
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      <main className="vpm-main">
        <TaskSection
          title={sectionTitle("daily")}
          badge={sectionBadge("daily")}
          frequency="daily"
          tasks={daily}
          selectedDateIso={selectedDateIso}
          onAdd={openCreate}
          completedTaskIds={completedTaskIds}
          completionDatesByTaskId={completionDatesByTaskId}
          setTaskCompletionForDate={setTaskCompletionForDate}
          onToggle={(task, completed) =>
            void setTaskCompletionForDate(task.id, selectedDateIso, completed)
          }
        />
        <TaskSection
          title={sectionTitle("weekly")}
          badge={sectionBadge("weekly")}
          frequency="weekly"
          tasks={weekly}
          selectedDateIso={selectedDateIso}
          onAdd={openCreate}
          completedTaskIds={completedTaskIds}
          completionDatesByTaskId={completionDatesByTaskId}
          setTaskCompletionForDate={setTaskCompletionForDate}
          onToggle={(task, completed) =>
            void setTaskCompletionForDate(task.id, selectedDateIso, completed)
          }
        />
        <TaskSection
          title={sectionTitle("monthly")}
          badge={sectionBadge("monthly")}
          frequency="monthly"
          tasks={monthly}
          selectedDateIso={selectedDateIso}
          onAdd={openCreate}
          completedTaskIds={completedTaskIds}
          completionDatesByTaskId={completionDatesByTaskId}
          setTaskCompletionForDate={setTaskCompletionForDate}
          onToggle={(task, completed) =>
            void setTaskCompletionForDate(task.id, selectedDateIso, completed)
          }
        />
        <TaskSection
          title={sectionTitle("interval")}
          badge={sectionBadge("interval")}
          frequency="interval"
          tasks={interval}
          selectedDateIso={selectedDateIso}
          onAdd={openCreate}
          completedTaskIds={completedTaskIds}
          completionDatesByTaskId={completionDatesByTaskId}
          setTaskCompletionForDate={setTaskCompletionForDate}
          onToggle={(task, completed) =>
            void setTaskCompletionForDate(task.id, selectedDateIso, completed)
          }
        />
        <TaskSection
          title={sectionTitle("once")}
          badge={sectionBadge("once")}
          frequency="once"
          tasks={once}
          selectedDateIso={selectedDateIso}
          onAdd={openCreate}
          completedTaskIds={completedTaskIds}
          completionDatesByTaskId={completionDatesByTaskId}
          setTaskCompletionForDate={setTaskCompletionForDate}
          onToggle={(task, completed) =>
            void setTaskCompletionForDate(task.id, selectedDateIso, completed)
          }
        />

        <section className="panel tracker-panel">
          <h2 className="tracker-title">Client Followup Tracker</h2>
          <div className="tracker-grid">
            {VPDM_TRACKS.map((track) => {
              const rows = (followupGrouped.get(track) ?? []).map((r) => ({
                id: r.id,
                client: r.clientName,
                owner: r.owner ?? "",
              }));
              return (
                <article key={track} className="tracker-card">
                  <h3>{track}</h3>
                  <ul>
                    {rows.map((entry) => {
                      const checked = completedClientIds.includes(entry.id);
                      return (
                        <li key={`${track}-${entry.client}`}>
                          <label className={checked ? "done" : ""}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) =>
                                void toggleFollowup(entry.id, e.target.checked)
                              }
                            />
                            <span>{entry.client}</span>
                            <em>({entry.owner})</em>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </article>
              );
            })}
          </div>
        </section>
      </main>

      {modal.open ? (
        <div className="modal-backdrop" role="presentation">
          <form className="task-modal" onSubmit={(e) => void submitModal(e)}>
            <div className="modal-head">
              <h3>{modal.mode === "create" ? "Add New Task" : "Edit Task"}</h3>
              <button
                type="button"
                className="btn ghost sm table-icon-btn"
                onClick={() => setModal((prev) => ({ ...prev, open: false }))}
              >
                <X size={16} aria-label="Close" />
              </button>
            </div>
            <label className="field">
              <span className="label">Task Name</span>
              <input
                className="input"
                value={modal.title}
                onChange={(e) => setModal((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="Enter task name..."
                required
              />
            </label>
            <div className="modal-row">
              <label className="field">
                <span className="label">Category</span>
              <select
                  className="input"
                  value={modal.category}
                  onChange={(e) => setModal((prev) => ({ ...prev, category: e.target.value }))}
              >
                {categoryOptions.length === 0 ? (
                  <option value="" disabled>
                    No categories found
                  </option>
                ) : null}
                {categoryOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              </label>
              <label className="field">
                <span className="label">Frequency</span>
                <select
                  className="input"
                  value={modal.frequency}
                  onChange={(e) =>
                    setModal((prev) => ({ ...prev, frequency: e.target.value as Frequency }))
                  }
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="interval">Every X days (example: every 15 days)</option>
                  <option value="once">One-time (specific date)</option>
                </select>
              </label>
            </div>

            <label className="field">
              <span className="label">
                {modal.frequency === "once" ? "Task Date" : "Start From"}
              </span>
              <input
                className="input"
                type="date"
                value={modal.startDate}
                onChange={(e) =>
                  setModal((prev) => ({ ...prev, startDate: e.target.value }))
                }
              />
              <p className="modal-help">
                {modal.frequency === "once"
                  ? "Task will appear only on this date."
                  : "Task will start showing from this date."}
              </p>
            </label>

            {modal.frequency === "weekly" ? (
              <label className="field">
                <span className="label">Repeat on Weekday</span>
                <select
                  className="input"
                  value={modal.repeatWeekday}
                  onChange={(e) =>
                    setModal((prev) => ({
                      ...prev,
                      repeatWeekday: e.target.value as (typeof WEEKDAYS)[number],
                    }))
                  }
                >
                  {WEEKDAYS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                <p className="modal-help">Task will appear every week on this day.</p>
              </label>
            ) : null}

            {modal.frequency === "monthly" ? (
              <label className="field">
                <span className="label">Repeat on Day of Month</span>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={31}
                  value={modal.repeatDayOfMonth}
                  onChange={(e) => setModal((prev) => ({ ...prev, repeatDayOfMonth: e.target.value }))}
                />
                <p className="modal-help">Task will appear on this date every month.</p>
              </label>
            ) : null}

            {modal.frequency === "interval" ? (
              <label className="field">
                <span className="label">Repeat Every (how many days?)</span>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={365}
                  value={modal.repeatIntervalDays}
                  onChange={(e) =>
                    setModal((prev) => ({ ...prev, repeatIntervalDays: e.target.value }))
                  }
                />
                <p className="modal-help">
                  Task will appear every {modal.repeatIntervalDays || "N"} days (e.g. every 15 days).
                </p>
              </label>
            ) : null}

            <div className="modal-actions">
              <button
                type="button"
                className="btn ghost"
                onClick={() => setModal((prev) => ({ ...prev, open: false }))}
              >
                Cancel
              </button>
              <button type="submit" className="btn primary" disabled={loading}>
                {modal.mode === "create" ? "Add Task" : "Save"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

    </div>
  );
}

type TaskSectionProps = {
  title: string;
  badge: string;
  frequency: Frequency;
  tasks: Task[];
  selectedDateIso: string;
  completedTaskIds: number[];
  completionDatesByTaskId: Map<number, Set<string>>;
  setTaskCompletionForDate: (taskId: number, dateIso: string, completed: boolean) => Promise<void>;
  onAdd: (frequency: Frequency) => void;
  onToggle: (task: Task, completed: boolean) => void;
};

function TaskSection({
  title,
  badge,
  frequency,
  tasks,
  selectedDateIso,
  completedTaskIds,
  completionDatesByTaskId,
  setTaskCompletionForDate,
  onAdd,
  onToggle,
}: TaskSectionProps) {
  void completedTaskIds;
  const pageSize = 10;
  const [page, setPage] = useState(1);

  useEffect(() => {
    // When switching date/frequency, reset to the first page for that table.
    setPage(1);
  }, [selectedDateIso, frequency]);

  const totalItems = tasks.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const startIdx = (page - 1) * pageSize;
  const pageTasks = tasks.slice(startIdx, startIdx + pageSize);

  return (
    <section className="panel task-section">
      <div className="section-head">
        <h2>
          {title} <span>{badge}</span>
        </h2>
        <button type="button" className="btn ghost sm" onClick={() => onAdd(frequency)}>
          + Add
        </button>
      </div>
      {tasks.length === 0 ? (
        <p className="empty-row">No {frequency} tasks for this date. Click "Add".</p>
      ) : (
        <div className="task-table-wrap">
          <table className="task-table">
            <thead>
              <tr>
                <th>#</th>
                <th>✓</th>
                <th>Task</th>
                <th>Scheduled</th>
                <th>Completed on</th>
                <th>Category</th>
              </tr>
            </thead>
            <tbody>
              {pageTasks.map((task, idx) => (
                (() => {
                  const doneIso = getTaskCompletedIsoForSelectedWindow(
                    task,
                    selectedDateIso,
                    completionDatesByTaskId
                  );
                  const done = doneIso != null;
                  return (
                <tr
                  key={task.id}
                  className={done ? "done" : ""}
                >
                  <td>{startIdx + idx + 1}</td>
                  <td>
                    <input
                      type="checkbox"
                      checked={done}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        if (checked) onToggle(task, true);
                        else if (doneIso) {
                          void setTaskCompletionForDate(task.id, doneIso, false);
                        }
                      }}
                    />
                  </td>
                  <td>{task.title}</td>
                  <td>{formatTaskOccurrenceDateLabel(task, selectedDateIso)}</td>
                  <td>
                    {formatTaskCompletedDateLabel(
                      task,
                      selectedDateIso,
                      completionDatesByTaskId
                    )}
                  </td>
                  <td>{task.category ?? "-"}</td>
                </tr>
                  );
                })()
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tasks.length > pageSize ? (
        <Pagination
          totalItems={tasks.length}
          pageSize={pageSize}
          currentPage={page}
          onPageChange={setPage}
        />
      ) : null}
    </section>
  );
}

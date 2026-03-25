import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import type { Frequency, Priority } from "../types";
import type { Task } from "../types";
import { useCategories } from "../useCategories";
import { useTasks } from "../useTasks";
import { toastApiError, toastSuccess } from "../toast";
import { PencilLine, Trash2 } from "lucide-react";
import { Pagination } from "../components/Pagination";
import "./add-task-page.css";

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

function defaultWeekday(): (typeof WEEKDAYS)[number] {
  return WEEKDAYS[new Date().getDay()];
}

function defaultDayOfMonth(): string {
  return String(new Date().getDate());
}

function formatDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00.000Z`);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type FormState = {
  title: string;
  category: string;
  frequency: Frequency;
  repeatWeekday: (typeof WEEKDAYS)[number];
  repeatDayOfMonth: string;
};

function emptyForm(frequency: Frequency): FormState {
  return {
    title: "",
    category: "",
    frequency,
    repeatWeekday: defaultWeekday(),
    repeatDayOfMonth: defaultDayOfMonth(),
  };
}

export function AddTaskPage() {
  const { user } = useAuth();
  const {
    tasks,
    loading,
    error,
    addTask,
    updateTask,
    removeTask,
  } = useTasks(user?.id);
  const { categories, loading: catsLoading } = useCategories(user?.id);

  const [form, setForm] = useState<FormState>(() => emptyForm("daily"));
  const [localError, setLocalError] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const pageSize = 10;
  const [page, setPage] = useState(1);

  const categoryOptions = useMemo(() => {
    return [...categories.map((c) => c.name)].sort((a, b) => a.localeCompare(b));
  }, [categories]);

  // If DB categories load (or change) and current selection is empty, pick the first DB category.
  // This keeps the dropdown "DB-only" while still allowing smooth creation.
  useEffect(() => {
    if (editingTaskId !== null) return;
    if (catsLoading) return;
    if (categoryOptions.length === 0) return;
    if (categoryOptions.includes(form.category)) return;
    setForm((prev) => ({ ...prev, category: categoryOptions[0] }));
  }, [catsLoading, categoryOptions, form.category, editingTaskId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLocalError(null);

    const title = form.title.trim();
    if (!title) return;

    try {
      const payload: Omit<
        Task,
        "id" | "createdAt" | "updatedAt" | "startDate" | "endDate"
      > = {
        title,
        notes: "",
        priority: "medium" as Priority,
        frequency: form.frequency,
        repeatWeekday:
          form.frequency === "weekly" ? form.repeatWeekday : null,
        repeatDayOfMonth:
          form.frequency === "monthly" ? Number(form.repeatDayOfMonth) : null,
        category: form.category.trim() || null,
      };

      if (editingTaskId) {
        await updateTask(editingTaskId, payload);
        toastSuccess("Task updated");
      } else {
        await addTask(payload);
        toastSuccess("Task added");
      }
      setForm(emptyForm(form.frequency));
      setEditingTaskId(null);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Failed to add task");
      toastApiError(err, editingTaskId ? "Failed to update task" : "Failed to add task");
    }
  }

  async function onDeleteTask(id: number) {
    const ok = window.confirm("Stop this task from future days?");
    if (!ok) return;
    const deleted = await removeTask(id);
    if (deleted) toastSuccess("Task stopped");
  }

  function onEditTask(task: Task) {
    setEditingTaskId(task.id);
    setForm({
      title: task.title,
      category: task.category ?? "",
      frequency: task.frequency,
      repeatWeekday: (task.repeatWeekday as (typeof WEEKDAYS)[number]) ?? defaultWeekday(),
      repeatDayOfMonth: String(task.repeatDayOfMonth ?? defaultDayOfMonth()),
    });
  }

  function resetForm() {
    setForm(emptyForm(form.frequency));
    setEditingTaskId(null);
    setLocalError(null);
  }

  const totalItems = tasks.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const startIdx = (page - 1) * pageSize;
  const pageTasks = tasks.slice(startIdx, startIdx + pageSize);

  useEffect(() => {
    // Reset table paging when tasks list changes (add/edit/stop/delete).
    setPage(1);
  }, [tasks.length]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  return (
    <main className="add-task-page">
      <section className="panel add-task-panel add-task-form-panel">
        <h2 className="add-task-title">Add Task</h2>
        <p className="add-task-subtitle">
          Create a new task. It will appear in your Task Manager once saved.
        </p>

        <form className="add-task-form" onSubmit={(e) => void onSubmit(e)}>
          <label className="field">
            <span className="label">Task Name</span>
            <input
              className="input"
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              placeholder="Enter task name..."
              required
              maxLength={200}
            />
          </label>

          <div className="add-task-row">
            <label className="field">
              <span className="label">Category</span>
              <select
                className="input"
                value={form.category}
                onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                disabled={catsLoading}
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
                value={form.frequency}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    frequency: e.target.value as Frequency,
                  }))
                }
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </label>
          </div>

          {form.frequency === "weekly" ? (
            <label className="field">
              <span className="label">Repeat on Weekday</span>
              <select
                className="input"
                value={form.repeatWeekday}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
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
              <p className="add-task-help">
                Task will appear every week on this day.
              </p>
            </label>
          ) : null}

          {form.frequency === "monthly" ? (
            <label className="field">
              <span className="label">Repeat on Day of Month</span>
              <input
                className="input"
                type="number"
                min={1}
                max={31}
                value={form.repeatDayOfMonth}
                onChange={(e) =>
                  setForm((p) => ({ ...p, repeatDayOfMonth: e.target.value }))
                }
              />
              <p className="add-task-help">
                Task will appear on this date every month.
              </p>
            </label>
          ) : null}

          <div className="add-task-actions">
            <button
              type="button"
              className="btn ghost"
              onClick={resetForm}
              disabled={loading}
            >
              {editingTaskId ? "Cancel Edit" : "Cancel"}
            </button>
            <button type="submit" className="btn primary" disabled={loading}>
              {editingTaskId ? "Save Changes" : "Add Task"}
            </button>
          </div>

          {localError ? <p className="add-task-error">{localError}</p> : null}
          {error ? <p className="add-task-error">{error}</p> : null}
        </form>

      </section>

      <section className="panel add-task-panel add-task-table-panel">
        <div className="add-task-list-head">
          <h3>Task List</h3>
        </div>
        {tasks.length === 0 ? (
          <p className="add-task-empty">No tasks yet.</p>
        ) : (
          <div className="add-task-table-wrap">
            <table className="add-task-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Task</th>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageTasks.map((task, idx) => (
                  <tr key={task.id}>
                    <td>{startIdx + idx + 1}</td>
                    <td>{task.title}</td>
                    <td>{formatDate(task.startDate)}</td>
                    <td>{task.category ?? "-"}</td>
                    <td>{task.endDate ? "Stopped" : "Active"}</td>
                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="btn ghost sm table-icon-btn"
                          onClick={() => onEditTask(task)}
                          disabled={Boolean(task.endDate)}
                          title={task.endDate ? "Stopped task cannot be edited" : "Edit task"}
                          aria-label="Edit task"
                        >
                          <PencilLine size={15} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="btn ghost sm table-icon-btn"
                          onClick={() => void onDeleteTask(task.id)}
                          disabled={Boolean(task.endDate)}
                          title={task.endDate ? "Task already stopped" : "Stop task"}
                          aria-label="Stop task"
                        >
                          <Trash2 size={15} aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
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
    </main>
  );
}


import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import type { Frequency, Priority } from "../types";
import type { Task } from "../types";
import { useCategories } from "../useCategories";
import { useTasks } from "../useTasks";
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
    loading,
    error,
    addTask,
  } = useTasks(user?.id);
  const { categories, loading: catsLoading } = useCategories(user?.id);

  const [form, setForm] = useState<FormState>(() => emptyForm("daily"));
  const [localError, setLocalError] = useState<string | null>(null);

  const categoryOptions = useMemo(() => {
    return [...categories.map((c) => c.name)].sort((a, b) => a.localeCompare(b));
  }, [categories]);

  // If DB categories load (or change) and current selection is empty, pick the first DB category.
  // This keeps the dropdown "DB-only" while still allowing smooth creation.
  useEffect(() => {
    if (catsLoading) return;
    if (categoryOptions.length === 0) return;
    if (categoryOptions.includes(form.category)) return;
    setForm((prev) => ({ ...prev, category: categoryOptions[0] }));
  }, [catsLoading, categoryOptions, form.category]);

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

      await addTask(payload);
      setForm(emptyForm(form.frequency));
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Failed to add task");
    }
  }

  return (
    <main className="add-task-page">
      <section className="panel add-task-panel">
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
              onClick={() => setForm(emptyForm(form.frequency))}
              disabled={loading}
            >
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={loading}>
              Add Task
            </button>
          </div>

          {localError ? <p className="add-task-error">{localError}</p> : null}
          {error ? <p className="add-task-error">{error}</p> : null}
        </form>
      </section>
    </main>
  );
}


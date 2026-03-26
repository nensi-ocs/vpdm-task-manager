import { useCallback, useEffect, useMemo, useState } from "react";
import type { Task, TaskUpsertPayload } from "./types";
import { apiDelete, apiGet, apiSendJson } from "./api";
import { toastApiError } from "./toast";
import {
  buildCompletionDatesMap,
  minCompletionRangeStartIso,
  type CompletionDatesByTaskId,
} from "./taskSchedule";

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

function cloneCompletionMap(m: CompletionDatesByTaskId): CompletionDatesByTaskId {
  const n = new Map<number, Set<string>>();
  for (const [k, v] of m) n.set(k, new Set(v));
  return n;
}

function todayIsoKolkata(): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

function maxIso(a: string, b: string): string {
  return a >= b ? a : b;
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00.000Z`);
  const next = new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
  return next.toISOString().slice(0, 10);
}

/**
 * Loads tasks for the signed-in user. Pass `userId` from `/auth/me` so the list
 * refetches when the account changes; the API only returns tasks for that user.
 */
export function useTasks(
  userId: string | undefined,
  selectedDateIso?: string
) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [completionDatesByTaskId, setCompletionDatesByTaskId] =
    useState<CompletionDatesByTaskId>(() => new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const completedTaskIds = useMemo(() => {
    if (!selectedDateIso) return [];
    const out: number[] = [];
    for (const [id, dates] of completionDatesByTaskId) {
      if (dates.has(selectedDateIso)) out.push(id);
    }
    return out;
  }, [completionDatesByTaskId, selectedDateIso]);

  const reload = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const list = await apiGet<Task[]>("/tasks");
      setTasks(list);
    } catch (e) {
      setError(errMessage(e));
      setTasks([]);
      toastApiError(e, "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!userId) {
      setTasks([]);
      setCompletionDatesByTaskId(new Map());
      setError(null);
      setLoading(false);
      return;
    }
    void reload();
  }, [userId, reload]);

  useEffect(() => {
    if (!userId || !selectedDateIso) {
      setCompletionDatesByTaskId(new Map());
      return;
    }
    void (async () => {
      try {
        const from = minCompletionRangeStartIso(tasks, selectedDateIso);
        // We may complete tasks on a later date than the selected schedule date.
        // Load a forward range so the scheduled day can show the future completion date too.
        const to = maxIso(
          maxIso(selectedDateIso, todayIsoKolkata()),
          addDaysIso(selectedDateIso, 366)
        );
        const res = await apiGet<{ items: { taskId: number; date: string }[] }>(
          `/tasks/completion-dates?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
        );
        setCompletionDatesByTaskId(buildCompletionDatesMap(res.items ?? []));
      } catch {
        setCompletionDatesByTaskId(new Map());
      }
    })();
  }, [selectedDateIso, userId, tasks]);

  const addTask = useCallback(
    async (task: TaskUpsertPayload) => {
    setError(null);
    try {
      const created = await apiSendJson<Task>("/tasks", "POST", task);
      setTasks((prev) => [created, ...prev]);
      return created;
    } catch (e) {
      setError(errMessage(e));
      throw e;
    }
  },
    []
  );

  const updateTask = useCallback(
    async (id: number, patch: Partial<Task>) => {
    setError(null);
    let previous: Task[] = [];
    setTasks((prev) => {
      previous = prev;
      return prev.map((t) => (t.id === id ? { ...t, ...patch } : t));
    });
    try {
      const updated = await apiSendJson<Task>(
        `/tasks/${encodeURIComponent(id)}`,
        "PATCH",
        patch
      );
      setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
    } catch (e) {
      setTasks(previous);
      setError(errMessage(e));
        toastApiError(e, "Failed to update task");
    }
    },
    []
  );

  const removeTask = useCallback(async (id: number): Promise<boolean> => {
    setError(null);
    try {
      const endDateParam = selectedDateIso
        ? `?endDate=${encodeURIComponent(selectedDateIso)}`
        : "";
      await apiDelete(`/tasks/${encodeURIComponent(id)}${endDateParam}`);
      if (selectedDateIso) {
        setTasks((prev) =>
          prev.map((t) => (t.id === id ? { ...t, endDate: selectedDateIso } : t))
        );
      } else {
        await reload();
      }
      return true;
    } catch (e) {
      setError(errMessage(e));
      toastApiError(e, "Failed to delete task");
      return false;
    }
  }, [reload, selectedDateIso]);

  const setTaskCompletionForDate = useCallback(
    async (taskId: number, dateIso: string, completed: boolean) => {
      setError(null);
      const beforeMap = cloneCompletionMap(completionDatesByTaskId);
      setCompletionDatesByTaskId((prev) => {
        const next = new Map(prev);
        const prior = next.get(taskId);
        const set = prior ? new Set(prior) : new Set<string>();
        if (completed) set.add(dateIso);
        else set.delete(dateIso);
        if (set.size === 0) next.delete(taskId);
        else next.set(taskId, set);
        return next;
      });
      try {
        await apiSendJson<{ ok: boolean }>(
          `/tasks/${encodeURIComponent(taskId)}/completion/${encodeURIComponent(dateIso)}`,
          "PATCH",
          { completed }
        );
      } catch (e) {
        setCompletionDatesByTaskId(beforeMap);
        setError(errMessage(e));
        toastApiError(e, "Failed to update task completion");
      }
    },
    [completionDatesByTaskId]
  );

  const importTasks = useCallback(async (list: Task[]) => {
    setError(null);
    try {
      const saved = await apiSendJson<Task[]>("/tasks/import", "POST", {
        tasks: list,
      });
      setTasks(saved);
    } catch (e) {
      setError(errMessage(e));
      throw e;
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    tasks,
    loading,
    error,
    reload,
    clearError,
    addTask,
    updateTask,
    removeTask,
    completedTaskIds,
    completionDatesByTaskId,
    setTaskCompletionForDate,
    importTasks,
  };
}

import { useCallback, useEffect, useState } from "react";
import type { Task } from "./types";
import { apiDelete, apiGet, apiSendJson } from "./api";

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
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
  const [completedTaskIds, setCompletedTaskIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const list = await apiGet<Task[]>("/tasks");
      setTasks(list);
    } catch (e) {
      setError(errMessage(e));
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!userId) {
      setTasks([]);
      setCompletedTaskIds([]);
      setError(null);
      setLoading(false);
      return;
    }
    void reload();
  }, [userId, reload]);

  useEffect(() => {
    if (!userId || !selectedDateIso) {
      setCompletedTaskIds([]);
      return;
    }
    void (async () => {
      try {
        const res = await apiGet<{ taskIds: number[] }>(
          `/tasks/completions/${encodeURIComponent(selectedDateIso)}`
        );
        setCompletedTaskIds(res.taskIds);
      } catch {
        setCompletedTaskIds([]);
      }
    })();
  }, [selectedDateIso, userId]);

  const addTask = useCallback(
    async (task: Omit<Task, "id" | "createdAt" | "updatedAt" | "startDate" | "endDate">) => {
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
    }
    },
    []
  );

  const removeTask = useCallback(async (id: number) => {
    setError(null);
    try {
      await apiDelete(`/tasks/${encodeURIComponent(id)}`);
      setTasks((prev) => prev.filter((t) => t.id !== id));
    } catch (e) {
      setError(errMessage(e));
    }
  }, []);

  const setTaskCompletionForDate = useCallback(
    async (taskId: number, dateIso: string, completed: boolean) => {
      setError(null);
      const before = completedTaskIds;
      setCompletedTaskIds((prev) => {
        const s = new Set(prev);
        if (completed) s.add(taskId);
        else s.delete(taskId);
        return [...s];
      });
      try {
        await apiSendJson<{ ok: boolean }>(
          `/tasks/${encodeURIComponent(taskId)}/completion/${encodeURIComponent(dateIso)}`,
          "PATCH",
          { completed }
        );
      } catch (e) {
        setCompletedTaskIds(before);
        setError(errMessage(e));
      }
    },
    [completedTaskIds]
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
    setTaskCompletionForDate,
    importTasks,
  };
}

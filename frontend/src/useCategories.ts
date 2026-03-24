import { useCallback, useEffect, useState } from "react";
import { apiDelete, apiGet, apiSendJson } from "./api";
import type { Category } from "./types";
import { toastApiError } from "./toast";

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

export function useCategories(userId: string | undefined) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const list = await apiGet<Category[]>("/categories");
      setCategories(list);
    } catch (e) {
      setError(errMessage(e));
      setCategories([]);
      toastApiError(e, "Failed to load categories");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!userId) {
      setCategories([]);
      setError(null);
      setLoading(false);
      return;
    }
    void reload();
  }, [userId, reload]);

  const addCategory = useCallback(async (name: string) => {
    const saved = await apiSendJson<Category>("/categories", "POST", { name });
    setCategories((prev) => [...prev, saved].sort((a, b) => a.name.localeCompare(b.name)));
  }, []);

  const removeCategory = useCallback(async (id: string) => {
    await apiDelete(`/categories/${encodeURIComponent(id)}`);
    setCategories((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const updateCategory = useCallback(async (id: string, name: string) => {
    const updated = await apiSendJson<Category>(
      `/categories/${encodeURIComponent(id)}`,
      "PATCH",
      { name }
    );
    setCategories((prev) =>
      prev
        .map((c) => (c.id === id ? updated : c))
        .sort((a, b) => a.name.localeCompare(b.name))
    );
  }, []);

  return {
    categories,
    loading,
    error,
    reload,
    addCategory,
    updateCategory,
    removeCategory,
  };
}

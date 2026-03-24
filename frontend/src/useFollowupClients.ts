import { useCallback, useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiSendJson } from "./api";
import type { FollowupClient } from "./types";

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

export function useFollowupClients(
  userId: string | undefined,
  selectedDateIso?: string
) {
  const [clients, setClients] = useState<FollowupClient[]>([]);
  const [completedClientIds, setCompletedClientIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const list = await apiGet<FollowupClient[]>("/followup-clients");
      setClients(list);
    } catch (e) {
      setError(errMessage(e));
      setClients([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!userId) {
      setClients([]);
      setCompletedClientIds([]);
      setError(null);
      setLoading(false);
      return;
    }
    void reload();
  }, [userId, reload]);

  useEffect(() => {
    if (!userId || !selectedDateIso) {
      setCompletedClientIds([]);
      return;
    }
    void (async () => {
      try {
        const res = await apiGet<{ clientIds: string[] }>(
          `/followup-clients/completions/${encodeURIComponent(selectedDateIso)}`
        );
        setCompletedClientIds(res.clientIds);
      } catch {
        setCompletedClientIds([]);
      }
    })();
  }, [selectedDateIso, userId]);

  const addClient = useCallback(
    async (track: string, clientName: string, owner: string | null) => {
      const saved = await apiSendJson<FollowupClient>("/followup-clients", "POST", {
        track,
        clientName,
        owner,
      });
      setClients((prev) =>
        [...prev, saved].sort((a, b) =>
          a.track === b.track
            ? a.clientName.localeCompare(b.clientName)
            : a.track.localeCompare(b.track)
        )
      );
      return saved;
    },
    []
  );

  const updateClient = useCallback(
    async (id: string, patch: Partial<Pick<FollowupClient, "track" | "clientName" | "owner">>) => {
      const updated = await apiSendJson<FollowupClient>(
        `/followup-clients/${encodeURIComponent(id)}`,
        "PATCH",
        patch
      );
      setClients((prev) =>
        prev
          .map((c) => (c.id === id ? updated : c))
          .sort((a, b) =>
            a.track === b.track
              ? a.clientName.localeCompare(b.clientName)
              : a.track.localeCompare(b.track)
          )
      );
      return updated;
    },
    []
  );

  const removeClient = useCallback(async (id: string) => {
    await apiDelete(`/followup-clients/${encodeURIComponent(id)}`);
    setClients((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const setClientCompletionForDate = useCallback(
    async (clientId: string, dateIso: string, completed: boolean) => {
      setError(null);
      const before = completedClientIds;
      setCompletedClientIds((prev) => {
        const s = new Set(prev);
        if (completed) s.add(clientId);
        else s.delete(clientId);
        return [...s];
      });
      try {
        await apiSendJson<{ ok: boolean }>(
          `/followup-clients/${encodeURIComponent(clientId)}/completion/${encodeURIComponent(
            dateIso
          )}`,
          "PATCH",
          { completed }
        );
      } catch (e) {
        setCompletedClientIds(before);
        setError(errMessage(e));
      }
    },
    [completedClientIds]
  );

  const grouped = useMemo(() => {
    const map = new Map<string, FollowupClient[]>();
    for (const c of clients) {
      const existing = map.get(c.track) ?? [];
      existing.push(c);
      map.set(c.track, existing);
    }
    return map;
  }, [clients]);

  return {
    clients,
    grouped,
    loading,
    error,
    reload,
    addClient,
    updateClient,
    removeClient,
    completedClientIds,
    setClientCompletionForDate,
  };
}


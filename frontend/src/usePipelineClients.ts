import { useCallback, useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiSendJson } from "./api";
import type { PipelineClient, PipelineStage } from "./types";
import { toastApiError } from "./toast";

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

/** Same `order` (step 6): won column before lost. */
function comparePipelineStages(a: PipelineStage, b: PipelineStage): number {
  if (a.order !== b.order) return a.order - b.order;
  const rank = (k: string) => (k === "deal_won" ? 0 : k === "deal_lost" ? 1 : 2);
  return rank(a.key) - rank(b.key) || a.key.localeCompare(b.key);
}

function compareClientsByStepThenName(a: PipelineClient, b: PipelineClient): number {
  if (a.stageOrder !== b.stageOrder) return a.stageOrder - b.stageOrder;
  const rank = (k: string) => (k === "deal_won" ? 0 : k === "deal_lost" ? 1 : 2);
  const stageTie = rank(a.stage) - rank(b.stage);
  if (stageTie !== 0) return stageTie;
  return a.clientName.localeCompare(b.clientName);
}

export function usePipelineClients(userId: string | undefined) {
  const [clients, setClients] = useState<PipelineClient[]>([]);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [stageList, list] = await Promise.all([
        apiGet<PipelineStage[]>("/pipeline-clients/stages"),
        apiGet<PipelineClient[]>("/pipeline-clients"),
      ]);
      setStages(stageList.slice().sort(comparePipelineStages));
      setClients(list);
    } catch (e) {
      setError(errMessage(e));
      setClients([]);
      toastApiError(e, "Failed to load pipeline clients");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!userId) {
      setClients([]);
      setStages([]);
      setError(null);
      setLoading(false);
      return;
    }
    void reload();
  }, [userId, reload]);

  const addClient = useCallback(
    async (clientName: string, source: string, stage?: string) => {
      const payload: { clientName: string; source: string; stage?: string } = {
        clientName,
        source,
      };
      if (stage) payload.stage = stage;
      const saved = await apiSendJson<PipelineClient>("/pipeline-clients", "POST", payload);
      setClients((prev) => [...prev, saved].sort(compareClientsByStepThenName));
      return saved;
    },
    []
  );

  const advanceClient = useCallback(async (id: string) => {
    const updated = await apiSendJson<PipelineClient>(
      `/pipeline-clients/${encodeURIComponent(id)}/advance`,
      "PATCH"
    );
    setClients((prev) => prev.map((c) => (c.id === id ? updated : c)));
    return updated;
  }, []);

  const markLost = useCallback(async (id: string, lostReason: string) => {
    const updated = await apiSendJson<PipelineClient>(
      `/pipeline-clients/${encodeURIComponent(id)}/mark-lost`,
      "PATCH",
      { lostReason }
    );
    setClients((prev) => prev.map((c) => (c.id === id ? updated : c)));
    return updated;
  }, []);

  const removeClient = useCallback(async (id: string) => {
    await apiDelete(`/pipeline-clients/${encodeURIComponent(id)}`);
    setClients((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, PipelineClient[]>();
    for (const c of clients) {
      const existing = map.get(c.stage) ?? [];
      existing.push(c);
      map.set(c.stage, existing);
    }
    for (const [, list] of map) {
      list.sort((a, b) => a.clientName.localeCompare(b.clientName));
    }
    return map;
  }, [clients]);

  return {
    clients,
    stages,
    grouped,
    loading,
    error,
    reload,
    addClient,
    advanceClient,
    markLost,
    removeClient,
  };
}


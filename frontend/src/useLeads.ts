import { useCallback, useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiSendFormData, apiSendJson } from "./api";
import type { LeadListResponse, LeadSource } from "./types";
import { toastApiError } from "./toast";

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

export function useLeads(userId: string | undefined) {
  const [sources, setSources] = useState<LeadSource[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [loadingSources, setLoadingSources] = useState(true);
  const [errorSources, setErrorSources] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [converted, setConverted] = useState("");
  const [adPlatform, setAdPlatform] = useState("");
  const [adPlatformOptions, setAdPlatformOptions] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const [leads, setLeads] = useState<LeadListResponse>({
    page: 1,
    pageSize: 50,
    total: 0,
    items: [],
  });
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [errorLeads, setErrorLeads] = useState<string | null>(null);

  const reloadSources = useCallback(async (): Promise<string | null> => {
    setErrorSources(null);
    setLoadingSources(true);
    try {
      const list = await apiGet<LeadSource[]>("/leads/sources");
      setSources(list);
      const nextSelected = ((): string | null => {
        // Default to "All" (null). Only keep selection if it still exists.
        if (selectedSourceId && list.some((s) => s.id === selectedSourceId)) return selectedSourceId;
        return null;
      })();
      setSelectedSourceId(nextSelected);
      return nextSelected;
    } catch (e) {
      setErrorSources(errMessage(e));
      setSources([]);
      setSelectedSourceId(null);
      toastApiError(e, "Failed to load lead sources");
      return null;
    } finally {
      setLoadingSources(false);
    }
  }, [selectedSourceId]);

  const reloadLeads = useCallback(
    async (
      sourceId: string | null,
      nextPage: number,
      nextQ: string,
      nextStatus: string,
      nextConverted: string,
      nextAdPlatform: string
    ) => {
      setErrorLeads(null);
      setLoadingLeads(true);
      try {
        const params = new URLSearchParams();
        if (sourceId) params.set("sourceId", sourceId);
        params.set("page", String(nextPage));
        params.set("pageSize", String(pageSize));
        if (nextQ.trim()) params.set("q", nextQ.trim());
        if (nextStatus.trim()) params.set("status", nextStatus.trim());
        if (nextConverted.trim()) params.set("converted", nextConverted.trim());
        if (nextAdPlatform.trim()) params.set("adPlatform", nextAdPlatform.trim());

        const res = await apiGet<LeadListResponse>(`/leads?${params.toString()}`);
        setLeads(res);
      } catch (e) {
        setErrorLeads(errMessage(e));
        setLeads({ page: nextPage, pageSize, total: 0, items: [] });
        toastApiError(e, "Failed to load leads");
      } finally {
        setLoadingLeads(false);
      }
    },
    [pageSize]
  );

  useEffect(() => {
    if (!userId) {
      setSources([]);
      setSelectedSourceId(null);
      setLoadingSources(false);
      setErrorSources(null);
      setLeads({ page: 1, pageSize, total: 0, items: [] });
      setLoadingLeads(false);
      setErrorLeads(null);
      return;
    }
    void reloadSources();
  }, [userId, reloadSources, pageSize]);

  const reloadAdPlatforms = useCallback(
    async (sourceId: string | null) => {
      try {
        const qs = sourceId ? `?sourceId=${encodeURIComponent(sourceId)}` : "";
        const list = await apiGet<string[]>(
          `/leads/ad-platforms${qs}`
        );
        setAdPlatformOptions(list);
        setAdPlatform((prev) => (prev && list.includes(prev) ? prev : ""));
      } catch (e) {
        setAdPlatformOptions([]);
        toastApiError(e, "Failed to load ad platforms");
      }
    },
    []
  );

  useEffect(() => {
    if (!userId) {
      setAdPlatformOptions([]);
      return;
    }
    void reloadAdPlatforms(selectedSourceId);
  }, [userId, selectedSourceId, reloadAdPlatforms]);

  useEffect(() => {
    if (!userId) return;
    void reloadLeads(selectedSourceId, page, q, status, converted, adPlatform);
  }, [userId, selectedSourceId, page, q, status, converted, adPlatform, reloadLeads]);

  const selectedSource = useMemo(
    () => sources.find((s) => s.id === selectedSourceId) ?? null,
    [sources, selectedSourceId]
  );

  const importXlsx = useCallback(async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    await apiSendFormData("/leads/import-xlsx", "POST", fd);
    const nextSourceId = await reloadSources();
    // Refresh table immediately after import (page 1).
    setPage(1);
    await reloadLeads(nextSourceId, 1, q, status, converted, adPlatform);
  }, [adPlatform, converted, q, reloadLeads, reloadSources, status]);

  const updateLead = useCallback(
    async (
      id: string,
      patch: {
        leadStatus?: string | null;
        reason?: string | null;
        callDone?: string | null;
        comment?: string | null;
        followUpRequired?: string | null;
        converted?: string | null;
      }
    ) => {
      await apiSendJson(`/leads/${encodeURIComponent(id)}`, "PATCH", patch);
      await reloadLeads(selectedSourceId, page, q, status, converted, adPlatform);
    },
    [adPlatform, converted, page, q, reloadLeads, selectedSourceId, status]
  );

  const deleteLead = useCallback(
    async (id: string) => {
      await apiDelete(`/leads/${encodeURIComponent(id)}`);
      await reloadAdPlatforms(selectedSourceId);
      await reloadLeads(selectedSourceId, page, q, status, converted, adPlatform);
    },
    [adPlatform, converted, page, q, reloadAdPlatforms, reloadLeads, selectedSourceId, status]
  );

  return {
    sources,
    selectedSource,
    selectedSourceId,
    setSelectedSourceId: (id: string | null) => {
      setSelectedSourceId(id);
      setPage(1);
    },
    loadingSources,
    errorSources,
    reloadSources,

    q,
    setQ: (v: string) => {
      setQ(v);
      setPage(1);
    },
    status,
    setStatus: (v: string) => {
      setStatus(v);
      setPage(1);
    },
    converted,
    setConverted: (v: string) => {
      setConverted(v);
      setPage(1);
    },
    adPlatform,
    setAdPlatform: (v: string) => {
      setAdPlatform(v);
      setPage(1);
    },
    page,
    setPage,
    pageSize,
    setPageSize: (n: number) => {
      const next = Number.isFinite(n) ? Math.max(1, Math.floor(n)) : 50;
      setPageSize(next);
      setPage(1);
    },

    leads,
    loadingLeads,
    errorLeads,

    adPlatformOptions,
    importXlsx,
    updateLead,
    deleteLead,
  };
}


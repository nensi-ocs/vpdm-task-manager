import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { usePipelineClients } from "../usePipelineClients";
import { apiGet, apiSendJson } from "../api";
import { toastApiError, toastSuccess } from "../toast";
import type { FollowupClient, PipelineClient, PipelineStage } from "../types";
import { VPDM_TRACKS } from "../vpdmCatalog";
import "./pipeline-clients-page.css";
import { Trash2, X } from "lucide-react";
import { Pagination } from "../components/Pagination";

type PipelineViewMode = "clients" | "board";

function PipelineStageDots({
  stages,
  currentStageKey,
}: {
  stages: PipelineStage[];
  currentStageKey: string;
}) {
  const steps = useMemo(() => {
    const byOrder = new Map<number, PipelineStage[]>();
    for (const s of stages) {
      const list = byOrder.get(s.order) ?? [];
      list.push(s);
      byOrder.set(s.order, list);
    }
    return [...byOrder.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([order, list]) => ({
        order,
        label: list.map((x) => x.label).join(" · "),
      }));
  }, [stages]);

  const currentOrder = stages.find((s) => s.key === currentStageKey)?.order ?? 0;

  return (
    <div className="p-stepper" aria-hidden="true">
      {steps.map((step) => {
        const isDone = step.order < currentOrder;
        const isCurrent = step.order === currentOrder;
        return (
          <span
            key={step.order}
            className={`p-dot ${isDone ? "done" : ""} ${isCurrent ? "current" : ""}`}
            title={step.label}
          />
        );
      })}
    </div>
  );
}

const STAGE_DETAILS: Record<string, string> = {
  lead_generated:
    "New inquiry received (ads, referral, website, WhatsApp, etc.). No qualification yet.",
  lead_qualified: "Checked budget, requirement, decision-maker. Fit for your service.",
  initial_contact:
    "First call or meeting done. Understand needs, pain points, expectations.",
  proposal_shared: "Quotation, plan, or strategy shared. Includes pricing & deliverables.",
  follow_up:
    "Regular follow-ups (call, WhatsApp, email). Objection handling (price, trust, timeline).",
  deal_won: "Client agrees. Payment received (full/partial). Onboarding starts.",
  onboarding: "Documents collected (GST, billing, access). Kickoff call + execution plan.",
  deal_lost: "Client rejected / no response / budget issue. Add reason for analysis.",
};

function isTerminalStage(stageKey: string): boolean {
  return stageKey === "onboarding" || stageKey === "deal_lost";
}

function vpdmTrackOrder(track: string): number {
  const i = (VPDM_TRACKS as readonly string[]).indexOf(track);
  return i === -1 ? 999 : i;
}

/** Table / export order: pipeline step first, then name within the same step. */
function compareClientsByStepThenName(a: PipelineClient, b: PipelineClient): number {
  if (a.stageOrder !== b.stageOrder) return a.stageOrder - b.stageOrder;
  const rank = (k: string) => (k === "deal_won" ? 0 : k === "deal_lost" ? 1 : 2);
  const stageTie = rank(a.stage) - rank(b.stage);
  if (stageTie !== 0) return stageTie;
  return a.clientName.localeCompare(b.clientName);
}

export function PipelineClientsPage() {
  const { user } = useAuth();
  const {
    clients,
    stages,
    grouped,
    loading,
    error,
    addClient,
    advanceClient,
    markLost,
    removeClient,
  } = usePipelineClients(user?.id);

  const [clientName, setClientName] = useState("");
  const [source, setSource] = useState("ads");
  const [addStage, setAddStage] = useState("lead_generated");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<PipelineViewMode>("board");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [boardPageByStage, setBoardPageByStage] = useState<Record<string, number>>({});
  const [boardPageSizeByStage, setBoardPageSizeByStage] = useState<Record<string, number>>({});
  const [clientTablePage, setClientTablePage] = useState(1);
  const [clientTablePageSize, setClientTablePageSize] = useState(10);

  const [lostModalOpen, setLostModalOpen] = useState(false);
  const [lostId, setLostId] = useState<string | null>(null);
  const [lostClientName, setLostClientName] = useState("");
  const [lostReason, setLostReason] = useState("");

  const [wonFollowupOpen, setWonFollowupOpen] = useState(false);
  const [wonFollowupClientName, setWonFollowupClientName] = useState("");
  const [wonFollowupTrack, setWonFollowupTrack] = useState<string>(VPDM_TRACKS[0]);
  const [wonFollowupOwner, setWonFollowupOwner] = useState("");
  /** True when this client name already exists on the selected follow-up track (PATCH vs POST). */
  const [followupModalIsUpdate, setFollowupModalIsUpdate] = useState(false);
  /** Follow-up list loaded for current modal fields (avoid Add/Update flash). */
  const [followupModalReady, setFollowupModalReady] = useState(false);
  /** User changed track in modal — do not auto-jump to another track. */
  const followupUserChangedTrackRef = useRef(false);
  /** Avoid refetch when effect re-runs only because we snapped `wonFollowupTrack`. */
  const followupModalListCacheRef = useRef<{ nameKey: string; list: FollowupClient[] } | null>(
    null
  );

  const stagesForAdd = useMemo(
    () => stages.filter((s) => s.key !== "deal_lost"),
    [stages]
  );

  useEffect(() => {
    if (stagesForAdd.length === 0) return;
    setAddStage((prev) =>
      stagesForAdd.some((s) => s.key === prev) ? prev : stagesForAdd[0].key
    );
  }, [stagesForAdd]);

  useEffect(() => {
    if (!wonFollowupOpen) {
      followupModalListCacheRef.current = null;
      setFollowupModalIsUpdate(false);
      setFollowupModalReady(false);
      return;
    }
    const name = wonFollowupClientName.trim();
    if (!name) {
      setFollowupModalIsUpdate(false);
      setFollowupModalReady(true);
      return;
    }
    const nameLower = name.toLowerCase();
    let cancelled = false;

    const applyFromList = (list: FollowupClient[]) => {
      const matches = list.filter(
        (x) => x.clientName.trim().toLowerCase() === nameLower
      );
      const forTrack = matches.find((x) => x.track === wonFollowupTrack);

      if (forTrack) {
        setFollowupModalIsUpdate(true);
        setWonFollowupOwner(forTrack.owner ?? "");
      } else if (!followupUserChangedTrackRef.current && matches.length > 0) {
        const sorted = [...matches].sort(
          (a, b) => vpdmTrackOrder(a.track) - vpdmTrackOrder(b.track)
        );
        const pick = sorted[0];
        setWonFollowupTrack(pick.track);
        setWonFollowupOwner(pick.owner ?? "");
        setFollowupModalIsUpdate(true);
      } else {
        setFollowupModalIsUpdate(false);
        setWonFollowupOwner((prev) =>
          followupUserChangedTrackRef.current ? prev : ""
        );
      }
    };

    void (async () => {
      try {
        const cached = followupModalListCacheRef.current;
        const cacheHit = cached !== null && cached.nameKey === nameLower;
        if (!cacheHit) {
          setFollowupModalReady(false);
          const list = await apiGet<FollowupClient[]>("/followup-clients");
          if (cancelled) return;
          followupModalListCacheRef.current = { nameKey: nameLower, list };
          applyFromList(list);
        } else {
          if (cancelled) return;
          applyFromList(cached.list);
        }
      } catch {
        if (!cancelled) {
          followupModalListCacheRef.current = null;
          setFollowupModalIsUpdate(false);
          setWonFollowupOwner((prev) =>
            followupUserChangedTrackRef.current ? prev : ""
          );
        }
      } finally {
        if (!cancelled) setFollowupModalReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wonFollowupOpen, wonFollowupClientName, wonFollowupTrack]);

  const queryTokens = useMemo(
    () =>
      query
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 0)
        .slice(0, 25),
    [query]
  );

  const filteredGrouped = useMemo(() => {
    if (queryTokens.length === 0) return grouped;
    const map = new Map<string, PipelineClient[]>();
    for (const s of stages) {
      const list = (grouped.get(s.key) ?? []).filter((c) => {
        const name = c.clientName.toLowerCase();
        const src = (c.source ?? "").toLowerCase();
        const reason = (c.lostReason ?? "").toLowerCase();
        return queryTokens.some(
          (t) => name.includes(t) || src.includes(t) || reason.includes(t)
        );
      });
      map.set(s.key, list);
    }
    return map;
  }, [grouped, queryTokens, stages]);

  const filteredClientsFlat = useMemo(() => {
    const list = clients.filter((c) => {
      if (queryTokens.length === 0) return true;
      const name = c.clientName.toLowerCase();
      const src = (c.source ?? "").toLowerCase();
      const reason = (c.lostReason ?? "").toLowerCase();
      const stageLabel = (c.stageLabel ?? "").toLowerCase();
      return queryTokens.some(
        (t) =>
          name.includes(t) ||
          src.includes(t) ||
          reason.includes(t) ||
          stageLabel.includes(t)
      );
    });
    list.sort(compareClientsByStepThenName);
    return list;
  }, [clients, queryTokens]);

  const clientTableTotalPages = Math.max(
    1,
    Math.ceil(filteredClientsFlat.length / clientTablePageSize)
  );
  const clientTableSafePage = Math.min(clientTablePage, clientTableTotalPages);
  const clientTableStart = (clientTableSafePage - 1) * clientTablePageSize;
  const clientTableShown = filteredClientsFlat.slice(
    clientTableStart,
    clientTableStart + clientTablePageSize
  );

  useEffect(() => {
    // Reset board pagination when filters change.
    setBoardPageByStage({});
  }, [queryTokens]);

  useEffect(() => {
    setClientTablePage(1);
  }, [queryTokens]);

  const total = useMemo(() => {
    let n = 0;
    for (const s of stages) n += filteredGrouped.get(s.key)?.length ?? 0;
    return n;
  }, [filteredGrouped, stages]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const name = clientName.trim();
    if (!name) return;
    setBusy(true);
    setLocalError(null);
    try {
      await addClient(name, source, addStage);
      setClientName("");
      setSource("ads");
      setAddStage(stagesForAdd[0]?.key ?? "lead_generated");
      toastSuccess("Client added");
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Failed to add client");
      toastApiError(err, "Failed to add client");
    } finally {
      setBusy(false);
    }
  }

  function openLostModal(c: PipelineClient) {
    setLostId(c.id);
    setLostClientName(c.clientName);
    setLostReason("");
    setLostModalOpen(true);
  }

  function closeLostModal() {
    setLostModalOpen(false);
    setLostId(null);
    setLostClientName("");
    setLostReason("");
  }

  async function submitLost() {
    if (!lostId) return;
    const reason = lostReason.trim();
    if (!reason) return;
    setBusy(true);
    setLocalError(null);
    try {
      await markLost(lostId, reason);
      closeLostModal();
      toastSuccess("Marked as Deal Lost");
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Failed to mark lost");
      toastApiError(err, "Failed to mark lost");
    } finally {
      setBusy(false);
    }
  }

  function closeWonFollowupModal() {
    followupUserChangedTrackRef.current = false;
    followupModalListCacheRef.current = null;
    setFollowupModalReady(false);
    setWonFollowupOpen(false);
    setWonFollowupClientName("");
    setWonFollowupTrack(VPDM_TRACKS[0]);
    setWonFollowupOwner("");
  }

  /** Deal Won (step 6): open follow-up modal without advancing the pipeline. */
  function openFollowupModalForDealWon(c: PipelineClient) {
    if (c.stage !== "deal_won") return;
    followupUserChangedTrackRef.current = false;
    setFollowupModalReady(false);
    setWonFollowupClientName(c.clientName);
    setWonFollowupTrack(VPDM_TRACKS[0]);
    setWonFollowupOwner("");
    setWonFollowupOpen(true);
  }

  async function submitWonFollowupAdd() {
    const name = wonFollowupClientName.trim();
    if (!name) return;
    setBusy(true);
    setLocalError(null);
    try {
      const list = await apiGet<FollowupClient[]>("/followup-clients");
      const nameLower = name.toLowerCase();
      const existing = list.find(
        (x) => x.track === wonFollowupTrack && x.clientName.trim().toLowerCase() === nameLower
      );
      if (existing) {
        await apiSendJson<FollowupClient>(
          `/followup-clients/${encodeURIComponent(existing.id)}`,
          "PATCH",
          {
            track: wonFollowupTrack,
            clientName: name,
            owner: wonFollowupOwner.trim() || null,
          }
        );
        closeWonFollowupModal();
        toastSuccess("Client Followup updated");
      } else {
        await apiSendJson<FollowupClient>("/followup-clients", "POST", {
          track: wonFollowupTrack,
          clientName: name,
          owner: wonFollowupOwner.trim() || null,
        });
        closeWonFollowupModal();
        toastSuccess("Added to Client Followup");
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Failed to save follow-up");
      toastApiError(err, "Failed to save follow-up");
    } finally {
      setBusy(false);
    }
  }

  async function handleAdvanceClient(c: PipelineClient) {
    try {
      setBusy(true);
      const updated = await advanceClient(c.id);
      toastSuccess("Moved to next stage");
      if (updated.stage === "deal_won") {
        openFollowupModalForDealWon(updated);
      }
    } catch (err) {
      toastApiError(err, "Failed to move to next stage");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="pipeline-page">
      <section className="panel pipeline-intro-panel">
        <h2 className="pipeline-title">Client Pipeline</h2>
        <p className="pipeline-subtitle">
          Add a new client at any pipeline step, then move them forward as needed. Showing clients:{" "}
          {total}
        </p>

        <form onSubmit={(e) => void onSubmit(e)} className="pipeline-add-form">
          <input
            className="input"
            placeholder="Client name"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            maxLength={200}
            required
          />
          <select className="input" value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="ads">Ads</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="website">Website</option>
            <option value="referral">Referral</option>
            <option value="call">Call</option>
            <option value="other">Other</option>
          </select>
          <select
            className="input"
            aria-label="Add client at pipeline stage"
            value={addStage}
            onChange={(e) => setAddStage(e.target.value)}
            disabled={stagesForAdd.length === 0}
          >
            {stagesForAdd.map((s) => (
              <option key={s.key} value={s.key}>
                {s.order}. {s.label}
              </option>
            ))}
          </select>
          <button type="submit" className="btn primary" disabled={busy}>
            Add Client
          </button>
        </form>

        <div className="pipeline-toolbar">
          <input
            className="input"
            placeholder="Search client / reference / lost reason…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            maxLength={200}
            aria-label="Search pipeline clients"
          />
          {query ? (
            <button
              type="button"
              className="btn ghost"
              onClick={() => setQuery("")}
              disabled={busy}
            >
              Clear
            </button>
          ) : null}
        </div>

        {localError ? <p style={{ color: "var(--danger)" }}>{localError}</p> : null}
        {error ? <p style={{ color: "var(--danger)" }}>{error}</p> : null}
      </section>

      <section className="panel">
        <div className="pipeline-view-head">
          <div>
            <h3 className="pipeline-section-title">
              {viewMode === "board" ? "Pipeline Board" : "All clients"}
            </h3>
            <p className="pipeline-board-hint">
              {viewMode === "board"
                ? "Track clients in each stage and move them step-by-step."
                : "One row per client: stage, source, and actions. Use the board to work column by column."}
            </p>
          </div>
          <div className="pipeline-view-switch" role="group" aria-label="Pipeline view">
            <button
              type="button"
              className={`btn ghost sm pipeline-view-toggle ${viewMode === "clients" ? "on" : ""}`}
              aria-pressed={viewMode === "clients"}
              onClick={() => setViewMode("clients")}
            >
              Clients
            </button>
            <button
              type="button"
              className={`btn ghost sm pipeline-view-toggle ${viewMode === "board" ? "on" : ""}`}
              aria-pressed={viewMode === "board"}
              onClick={() => setViewMode("board")}
            >
              Board
            </button>
          </div>
        </div>

        {loading ? <p>Loading...</p> : null}

        {!loading && viewMode === "clients" ? (
          <div className="pipeline-client-view" role="region" aria-label="Clients list">
            {filteredClientsFlat.length === 0 ? (
              <p className="pipeline-empty">No clients match your search.</p>
            ) : (
              <>
                <div className="pipeline-client-table-top">
                  <div className="pipeline-client-table-meta">
                    Showing{" "}
                    <strong>
                      {filteredClientsFlat.length === 0 ? 0 : clientTableStart + 1}
                    </strong>
                    –
                    <strong>
                      {Math.min(
                        filteredClientsFlat.length,
                        clientTableStart + clientTablePageSize
                      )}
                    </strong>{" "}
                    of <strong>{filteredClientsFlat.length}</strong>
                  </div>
                  <label className="pipeline-page-size">
                    <span>Rows</span>
                    <select
                      className="input sm"
                      value={clientTablePageSize}
                      onChange={(e) => {
                        setClientTablePageSize(Number(e.target.value));
                        setClientTablePage(1);
                      }}
                    >
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                    </select>
                  </label>
                </div>

                <div className="pipeline-client-table-wrap">
                    <table className="pipeline-client-table">
                    <thead>
                      <tr>
                        <th className="col-client">Client</th>
                        <th className="col-ref">Ref</th>
                        <th className="col-step">Stage</th>
                        <th className="col-flow">Progress</th>
                        <th className="col-actions">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clientTableShown.map((c) => (
                        <tr key={c.id}>
                          <td className="col-client p-client">
                            <div className="p-client-name" title={c.clientName}>
                              {c.clientName}
                            </div>
                            {c.stage === "deal_lost" && c.lostReason ? (
                              <div className="p-client-lost" title={c.lostReason}>
                                Reason: {c.lostReason}
                              </div>
                            ) : null}
                          </td>
                          <td className="col-ref p-ref">
                            {(c.source || "unknown").toUpperCase()}
                          </td>
                          <td className="col-step">
                            <span className={`p-badge ${c.stage}`}>{c.stageLabel}</span>
                          </td>
                          <td className="col-flow">
                            <PipelineStageDots stages={stages} currentStageKey={c.stage} />
                          </td>
                          <td className="col-actions">
                            <div className="p-actions">
                            <button
                              type="button"
                              className="btn ghost sm"
                              disabled={busy || isTerminalStage(c.stage)}
                              onClick={() => void handleAdvanceClient(c)}
                            >
                              Next
                            </button>
                            {c.stage === "deal_won" ? (
                              <button
                                type="button"
                                className="btn ghost sm"
                                disabled={busy}
                                title="Add to Client Followup"
                                onClick={() => openFollowupModalForDealWon(c)}
                              >
                                Follow-up
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="btn ghost sm danger"
                              disabled={busy || c.stage === "deal_lost"}
                              onClick={() => openLostModal(c)}
                            >
                              Lost
                            </button>
                            <button
                              type="button"
                              className="btn ghost sm"
                              disabled={busy}
                              title="Delete client"
                              onClick={async () => {
                                try {
                                  setBusy(true);
                                  await removeClient(c.id);
                                  toastSuccess("Client deleted");
                                } catch (err) {
                                  toastApiError(err, "Failed to delete client");
                                } finally {
                                  setBusy(false);
                                }
                              }}
                            >
                              <Trash2 size={16} aria-hidden="true" />
                            </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    </table>
                </div>

                <Pagination
                  totalItems={filteredClientsFlat.length}
                  pageSize={clientTablePageSize}
                  currentPage={clientTableSafePage}
                  onPageChange={setClientTablePage}
                />
              </>
            )}
          </div>
        ) : null}

        {!loading && viewMode === "board" ? (
          <div className="pipeline-tracker-grid" role="region" aria-label="Pipeline board">
            {stages.map((s) => {
              const list = filteredGrouped.get(s.key) ?? [];
              const isCollapsed = collapsed[s.key] ?? false;
              const boardPageSize = boardPageSizeByStage[s.key] ?? 10;
              const totalPages = Math.max(1, Math.ceil(list.length / boardPageSize));
              const boardPage = Math.min(boardPageByStage[s.key] ?? 1, totalPages);
              const start = (boardPage - 1) * boardPageSize;
              const shown = list.slice(start, start + boardPageSize);
              return (
                <section key={s.key} className="pipeline-tracker-card" aria-label={`${s.label} column`}>
                  <button
                    type="button"
                    className="pipeline-tracker-head"
                    aria-expanded={!isCollapsed}
                    onClick={() =>
                      setCollapsed((prev) => ({ ...prev, [s.key]: !isCollapsed }))
                    }
                    title={STAGE_DETAILS[s.key] ?? ""}
                  >
                    <span className="pipeline-tracker-head-title">
                      {s.order}. {s.label}
                    </span>
                    <span className="pipeline-tracker-count">{list.length}</span>
                    <span className="pipeline-tracker-toggle">{isCollapsed ? "Show" : "Hide"}</span>
                  </button>

                  {isCollapsed ? null : list.length === 0 ? (
                    <p className="pipeline-empty">No clients yet.</p>
                  ) : (
                    <>
                      <div className="pipeline-board-table-top">
                        <div className="pipeline-board-table-meta">
                          Showing <strong>{list.length === 0 ? 0 : start + 1}</strong>–
                          <strong>{Math.min(list.length, start + boardPageSize)}</strong> of{" "}
                          <strong>{list.length}</strong>
                        </div>
                        <label className="pipeline-page-size">
                          <span>Rows</span>
                          <select
                            className="input sm"
                            value={boardPageSize}
                            onChange={(e) =>
                              setBoardPageSizeByStage((prev) => ({
                                ...prev,
                                [s.key]: Number(e.target.value),
                              }))
                            }
                          >
                            <option value={5}>5</option>
                            <option value={10}>10</option>
                            <option value={20}>20</option>
                          </select>
                        </label>
                      </div>

                      <div className="pipeline-board-table-wrap">
                        <table className="pipeline-board-table">
                          <thead>
                            <tr>
                              <th>Client</th>
                              <th>Ref</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {shown.map((c) => (
                              <tr key={c.id}>
                                <td className="p-client">
                                  <div className="p-client-name" title={c.clientName}>
                                    {c.clientName}
                                  </div>
                                  {c.stage === "deal_lost" && c.lostReason ? (
                                    <div className="p-client-lost" title={c.lostReason}>
                                      Reason: {c.lostReason}
                                    </div>
                                  ) : null}
                                </td>
                                <td className="p-ref">{(c.source || "unknown").toUpperCase()}</td>
                                <td>
                                  <div className="p-actions">
                                  <button
                                    type="button"
                                    className="btn ghost sm"
                                    disabled={busy || isTerminalStage(c.stage)}
                                    onClick={() => void handleAdvanceClient(c)}
                                  >
                                    Next
                                  </button>
                                  {c.stage === "deal_won" ? (
                                    <button
                                      type="button"
                                      className="btn ghost sm"
                                      disabled={busy}
                                      title="Add to Client Followup"
                                      onClick={() => openFollowupModalForDealWon(c)}
                                    >
                                      Follow-up
                                    </button>
                                  ) : null}
                                  <button
                                    type="button"
                                    className="btn ghost sm danger"
                                    disabled={
                                      busy ||
                                      isTerminalStage(c.stage) ||
                                      c.stage === "deal_won"
                                    }
                                    onClick={() => openLostModal(c)}
                                  >
                                    Lost
                                  </button>
                                  <button
                                    type="button"
                                    className="btn ghost sm"
                                    disabled={busy}
                                    title="Delete client"
                                    onClick={async () => {
                                      try {
                                        setBusy(true);
                                        await removeClient(c.id);
                                        toastSuccess("Client deleted");
                                      } catch (err) {
                                        toastApiError(err, "Failed to delete client");
                                      } finally {
                                        setBusy(false);
                                      }
                                    }}
                                  >
                                    <Trash2 size={16} aria-hidden="true" />
                                  </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <Pagination
                        totalItems={list.length}
                        pageSize={boardPageSize}
                        currentPage={boardPage}
                        onPageChange={(p) =>
                          setBoardPageByStage((prev) => ({ ...prev, [s.key]: p }))
                        }
                      />
                    </>
                  )}
                </section>
              );
            })}
          </div>
        ) : null}
      </section>

      {wonFollowupOpen ? (
        <div
          className="pipeline-modal-backdrop"
          role="presentation"
          onClick={() => closeWonFollowupModal()}
        >
          <form
            className="pipeline-modal"
            onSubmit={(e) => {
              e.preventDefault();
              void submitWonFollowupAdd();
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pipeline-modal-head">
              <h3>
                {!followupModalReady
                  ? "Client Followup"
                  : followupModalIsUpdate
                    ? "Update Client Followup?"
                    : "Add to Client Followup?"}
              </h3>
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => closeWonFollowupModal()}
                aria-label="Close"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            <p className="pipeline-modal-subtitle">
              {!followupModalReady ? (
                <>Loading follow-up data…</>
              ) : (
                <>
                  <strong>{wonFollowupClientName}</strong> is in Deal Won.{" "}
                  {followupModalIsUpdate ? (
                    <>
                      They already have a row on <strong>{wonFollowupTrack}</strong>—update owner
                      below or skip. Manage all entries on the{" "}
                      <Link to="/followup-clients">Client Followup</Link> page.
                    </>
                  ) : (
                    <>
                      Add them to a follow-up track for daily check-ins, or skip and add later on
                      the <Link to="/followup-clients">Client Followup</Link> page.
                    </>
                  )}
                </>
              )}
            </p>

            <label className="field">
              <span className="label">Track</span>
              <select
                className="input"
                value={wonFollowupTrack}
                onChange={(e) => {
                  followupUserChangedTrackRef.current = true;
                  setWonFollowupTrack(e.target.value);
                }}
                aria-label="Follow-up track"
              >
                {VPDM_TRACKS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="label">Owner (optional)</span>
              <input
                className="input"
                value={wonFollowupOwner}
                onChange={(e) => setWonFollowupOwner(e.target.value)}
                maxLength={120}
                placeholder="e.g. team member name"
              />
            </label>

            <div className="pipeline-modal-actions">
              <button type="button" className="btn ghost" onClick={() => closeWonFollowupModal()}>
                Skip
              </button>
              <button
                type="submit"
                className="btn primary"
                disabled={busy || !followupModalReady}
                aria-label={
                  !followupModalReady
                    ? "Loading"
                    : followupModalIsUpdate
                      ? "Update Client Followup entry"
                      : "Add to Client Followup"
                }
              >
                {!followupModalReady
                  ? "Loading…"
                  : followupModalIsUpdate
                    ? "Update follow-up"
                    : "Add to follow-up"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {lostModalOpen ? (
        <div className="pipeline-modal-backdrop" role="presentation" onClick={() => closeLostModal()}>
          <form
            className="pipeline-modal"
            onSubmit={(e) => {
              e.preventDefault();
              void submitLost();
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pipeline-modal-head">
              <h3>Deal Lost</h3>
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => closeLostModal()}
                aria-label="Close"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            <p className="pipeline-modal-subtitle">
              Client: <strong>{lostClientName}</strong>
            </p>

            <label className="field">
              <span className="label">Reason (required)</span>
              <input
                className="input"
                value={lostReason}
                onChange={(e) => setLostReason(e.target.value)}
                maxLength={300}
                required
                autoFocus
              />
            </label>

            <div className="pipeline-modal-actions">
              <button type="button" className="btn ghost" onClick={() => closeLostModal()}>
                Cancel
              </button>
              <button type="submit" className="btn primary" disabled={busy}>
                Save
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}


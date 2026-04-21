import { useMemo, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { useLeads } from "../useLeads";
import { Pagination } from "../components/Pagination";
import { toastApiError, toastSuccess } from "../toast";
import { apiGet, apiSendJson } from "../api";
import type { FollowupClient, PipelineClient, PipelineStage } from "../types";
import { VPDM_TRACKS } from "../vpdmCatalog";
import { PencilLine, Trash2 } from "lucide-react";
import "./leads-page.css";

function fmtYmd(iso: string | null): string {
  return iso ? iso : "-";
}

function cellText(v: string | null | undefined): string {
  return (v ?? "").trim() || "-";
}

function statusClass(v: string | null | undefined): string {
  const s = (v ?? "").trim().toLowerCase();
  if (!s) return "neutral";
  if (s === "created" || s === "new") return "created";
  if (s === "pending" || s.includes("in progress")) return "pending";
  if (s === "qualified" || (s.includes("qualified") && !s.includes("not qualified"))) {
    return "qualified";
  }
  if (s === "not qualified" || s.includes("not qualified")) return "not-qualified";
  if (s === "invalid lead" || s.includes("invalid") || s.includes("fake")) return "invalid-lead";
  return "neutral";
}

const LEAD_STATUS_OPTIONS = [
  "CREATED",
  "PENDING",
  "QUALIFIED",
  "NOT QUALIFIED",
  "INVALID LEAD",
] as const;

const CONVERTED_OPTIONS = ["Yes", "No"] as const;

function normalizeStatusForSelect(v: string): string {
  const s = v.trim();
  if (!s) return "CREATED";
  const up = s.toUpperCase();
  // Keep legacy / mixed-case values consistent with the dropdown options.
  if (up === "CREATED") return "CREATED";
  if (up === "PENDING") return "PENDING";
  if (up === "QUALIFIED") return "QUALIFIED";
  if (up === "NOT QUALIFIED") return "NOT QUALIFIED";
  if (up === "INVALID LEAD") return "INVALID LEAD";
  return up;
}

function normalizeConvertedForSelect(v: string): string {
  const s = v.trim();
  if (!s) return "";
  const upper = s.toUpperCase();
  if (upper === "Y" || upper === "YES" || upper === "TRUE") return "Yes";
  if (upper === "N" || upper === "NO" || upper === "FALSE") return "No";
  return s;
}

export function LeadsPage() {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCompany, setEditCompany] = useState("");
  const [editLeadStatus, setEditLeadStatus] = useState("");
  const [editReason, setEditReason] = useState("");
  const [editCallDone, setEditCallDone] = useState("");
  const [editComment, setEditComment] = useState("");
  const [editFollowUpRequired, setEditFollowUpRequired] = useState("");
  const [editConverted, setEditConverted] = useState("");

  const [pipelineOpen, setPipelineOpen] = useState(false);
  const [pipelineBusy, setPipelineBusy] = useState(false);
  const [pipelineStages, setPipelineStages] = useState<PipelineStage[]>([]);
  const [pipelineExistingId, setPipelineExistingId] = useState<string | null>(null);
  const [pipelineClientName, setPipelineClientName] = useState("");
  const [pipelineSource, setPipelineSource] = useState("ads");
  const [pipelineStage, setPipelineStage] = useState("lead_generated");
  const [pipelineLostReason, setPipelineLostReason] = useState("");

  const [followupOpen, setFollowupOpen] = useState(false);
  const [followupBusy, setFollowupBusy] = useState(false);
  const [followupReady, setFollowupReady] = useState(false);
  const [followupClientName, setFollowupClientName] = useState("");
  const [followupTrack, setFollowupTrack] = useState<string>(VPDM_TRACKS[0]);
  const [followupOwner, setFollowupOwner] = useState("");
  const [followupIsUpdate, setFollowupIsUpdate] = useState(false);
  const [followupEntries, setFollowupEntries] = useState<FollowupClient[]>([]);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteLabel, setDeleteLabel] = useState("");
  const {
    sources,
    selectedSourceId,
    setSelectedSourceId,
    loadingSources,
    errorSources,
    q,
    setQ,
    status,
    setStatus,
    converted: leadConvertedFilter,
    setConverted: setLeadConvertedFilter,
    adPlatform,
    setAdPlatform,
    adPlatformOptions,
    page,
    setPage,
    pageSize,
    setPageSize,
    leads,
    loadingLeads,
    errorLeads,
    importXlsx,
    updateLead,
    deleteLead,
  } = useLeads(user?.id);

  type SortKey =
    | "leadDate"
    | "fullName"
    | "email"
    | "phoneNumber"
    | "companyName"
    | "adPlatform"
    | "leadStatus"
    | "reason"
    | "callDone"
    | "comment"
    | "followUpRequired"
    | "converted";
  type SortDir = "asc" | "desc";

  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function cmpText(a: string, b: string): number {
    return a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
  }

  function sortLabel(k: SortKey): string {
    if (k === "leadDate") return "Date";
    if (k === "fullName") return "Name";
    if (k === "email") return "Email";
    if (k === "phoneNumber") return "Phone";
    if (k === "companyName") return "Company";
    if (k === "adPlatform") return "Ad Platform";
    if (k === "leadStatus") return "Status";
    if (k === "reason") return "Reason";
    if (k === "callDone") return "Call Done";
    if (k === "comment") return "Comment";
    if (k === "followUpRequired") return "Follow up Required";
    return "Converted";
  }

  function toggleSort(nextKey: SortKey) {
    setSortKey((prevKey) => {
      if (prevKey !== nextKey) {
        setSortDir("asc");
        return nextKey;
      }
      if (sortDir === "asc") {
        setSortDir("desc");
        return nextKey;
      }
      setSortDir("asc");
      return null;
    });
  }

  function sortGlyph(key: SortKey): string {
    if (sortKey !== key) return "↕";
    return sortDir === "asc" ? "↑" : "↓";
  }

  function SortTh({ k }: { k: SortKey }) {
    const isOn = sortKey === k;
    return (
      <button
        type="button"
        className={`leads-sort ${isOn ? "on" : ""}`}
        onClick={() => toggleSort(k)}
        aria-label={`Sort by ${sortLabel(k)} ${
          isOn ? (sortDir === "asc" ? "descending" : "remove sort") : "ascending"
        }`}
        title={`Sort by ${sortLabel(k)}`}
      >
        <span className="leads-sort-text">{sortLabel(k)}</span>
        <span className="leads-sort-icon" aria-hidden="true">
          {sortGlyph(k)}
        </span>
      </button>
    );
  }

  const shownItems = useMemo(() => {
    const items = leads.items.slice();
    if (!sortKey) return items;

    const dirMul = sortDir === "asc" ? 1 : -1;
    const get = (r: (typeof leads.items)[number]): string => {
      if (sortKey === "adPlatform") return cellText(r.adPlatform ?? r.platform);
      if (sortKey === "leadDate") return fmtYmd(r.leadDate);
      const rec = r as unknown as Record<string, unknown>;
      return cellText(rec[sortKey] as string | null | undefined);
    };

    items.sort((a, b) => {
      const av = get(a);
      const bv = get(b);
      const aEmpty = av === "-" || av === "";
      const bEmpty = bv === "-" || bv === "";
      if (aEmpty && bEmpty) return 0;
      if (aEmpty) return 1;
      if (bEmpty) return -1;
      const c = cmpText(av, bv);
      return c * dirMul;
    });
    return items;
  }, [leads.items, sortDir, sortKey]);

  const start = (page - 1) * pageSize;
  const shownFrom = leads.total === 0 ? 0 : start + 1;
  const shownTo = Math.min(leads.total, start + pageSize);

  if (!user) return null;

  function openEdit(r: {
    id: string;
    fullName: string | null;
    companyName: string | null;
    leadStatus: string | null;
    reason: string | null;
    callDone: string | null;
    comment: string | null;
    followUpRequired: string | null;
    converted: string | null;
  }) {
    setLocalError(null);
    setEditId(r.id);
    setEditName((r.fullName ?? "").trim());
    setEditCompany((r.companyName ?? "").trim());
    setEditLeadStatus(normalizeStatusForSelect(r.leadStatus ?? ""));
    setEditReason((r.reason ?? "").trim());
    setEditCallDone((r.callDone ?? "").trim());
    setEditComment((r.comment ?? "").trim());
    setEditFollowUpRequired((r.followUpRequired ?? "").trim());
    setEditConverted(normalizeConvertedForSelect(r.converted ?? ""));
    setEditOpen(true);
  }

  function closeEdit() {
    if (editBusy) return;
    setEditOpen(false);
    setEditId(null);
    setEditName("");
    setEditCompany("");
    setEditLeadStatus("");
    setEditReason("");
    setEditCallDone("");
    setEditComment("");
    setEditFollowUpRequired("");
    setEditConverted("");
  }

  function closePipelineModal() {
    if (pipelineBusy) return;
    setPipelineOpen(false);
    setPipelineBusy(false);
    setPipelineStages([]);
    setPipelineExistingId(null);
    setPipelineClientName("");
    setPipelineSource("ads");
    setPipelineStage("lead_generated");
    setPipelineLostReason("");
  }

  async function openPipelineModal(overrideClientName?: string) {
    const defaultName =
      (overrideClientName != null && overrideClientName.trim() !== ""
        ? overrideClientName
        : editName || editCompany || ""
      ).trim();
    setPipelineClientName(defaultName);
    setPipelineSource("ads");
    setPipelineStage("lead_generated");
    setPipelineExistingId(null);
    setPipelineLostReason("");
    setPipelineOpen(true);
    try {
      const [stages, clients] = await Promise.all([
        apiGet<PipelineStage[]>("/pipeline-clients/stages"),
        apiGet<PipelineClient[]>("/pipeline-clients"),
      ]);
      const stageList = stages;
      setPipelineStages(stageList);

      const nameLower = defaultName.trim().toLowerCase();
      const existing =
        nameLower ? clients.find((c) => c.clientName.trim().toLowerCase() === nameLower) : null;
      if (existing) {
        setPipelineExistingId(existing.id);
        setPipelineClientName(existing.clientName);
        setPipelineSource(existing.source || "ads");
        const keyOk = stageList.some((s) => s.key === existing.stage);
        setPipelineStage(keyOk ? existing.stage : stageList[0]?.key ?? "lead_generated");
      } else {
        const first = stageList.slice().sort((a, b) => a.order - b.order)[0]?.key;
        if (first) setPipelineStage(first);
      }
    } catch (err) {
      // If stages fail, we still allow save with a sane default.
      toastApiError(err, "Failed to load pipeline stages");
    }
  }

  function closeFollowupModal() {
    if (followupBusy) return;
    setFollowupReady(false);
    setFollowupOpen(false);
    setFollowupBusy(false);
    setFollowupClientName("");
    setFollowupTrack(VPDM_TRACKS[0]);
    setFollowupOwner("");
    setFollowupIsUpdate(false);
    setFollowupEntries([]);
  }

  function vpdmTrackOrder(track: string): number {
    const i = (VPDM_TRACKS as readonly string[]).indexOf(track);
    return i === -1 ? 999 : i;
  }

  async function openFollowupModalForClient(name: string) {
    const clientName = name.trim();
    if (!clientName) return;
    setFollowupReady(false);
    setFollowupClientName(clientName);
    setFollowupTrack(VPDM_TRACKS[0]);
    setFollowupOwner("");
    setFollowupIsUpdate(false);
    setFollowupEntries([]);
    setFollowupOpen(true);
    try {
      const list = await apiGet<FollowupClient[]>("/followup-clients");
      const nameLower = clientName.toLowerCase();
      const matches = list.filter((x) => x.clientName.trim().toLowerCase() === nameLower);
      setFollowupEntries(matches);

      if (matches.length > 0) {
        const onDefault = matches.find((x) => x.track === VPDM_TRACKS[0]) ?? null;
        const pick =
          onDefault ??
          [...matches].sort((a, b) => vpdmTrackOrder(a.track) - vpdmTrackOrder(b.track))[0];
        setFollowupTrack(pick.track);
        setFollowupOwner(pick.owner ?? "");
        setFollowupIsUpdate(true);
      }
    } catch (err) {
      toastApiError(err, "Failed to load follow-up clients");
    } finally {
      setFollowupReady(true);
    }
  }

  function isConflictAlreadyExists(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : "";
    return msg.toLowerCase().includes("already exists");
  }

  function openDeleteModal(id: string, label: string) {
    setLocalError(null);
    setDeleteId(id);
    setDeleteLabel(label);
    setDeleteOpen(true);
  }

  function closeDeleteModal() {
    if (deleteBusy) return;
    setDeleteOpen(false);
    setDeleteId(null);
    setDeleteLabel("");
  }

  return (
    <main className="leads-page">
      <section className="panel leads-intro-panel">
        <h2 className="leads-title">Leads</h2>
        <p className="leads-subtitle">
          View leads by source sheet. Import your monthly XLSX file and manage leads from it.
        </p>

        <div className="leads-intro-actions">
          <label className="leads-import">
            <span className="leads-import-label">Import XLSX</span>
            <div className="leads-import-row">
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx"
                className="input"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setSelectedFile(f);
                }}
              />
              <button
                type="button"
                className="btn primary"
                disabled={!selectedFile || importing}
                onClick={() => {
                  if (!selectedFile) return;
                  void (async () => {
                    setLocalError(null);
                    setImporting(true);
                    try {
                      await importXlsx(selectedFile);
                      setSelectedFile(null);
                      if (fileRef.current) fileRef.current.value = "";
                    } catch (err) {
                      setLocalError(err instanceof Error ? err.message : "Failed to import XLSX");
                    } finally {
                      setImporting(false);
                    }
                  })();
                }}
              >
                {importing ? "Importing…" : "Import"}
              </button>
              {selectedFile ? (
                <button
                  type="button"
                  className="btn ghost"
                  disabled={importing}
                  onClick={() => {
                    setSelectedFile(null);
                    if (fileRef.current) fileRef.current.value = "";
                  }}
                >
                  Clear
                </button>
              ) : null}
            </div>
          </label>
        </div>

        {localError ? <p className="leads-error">{localError}</p> : null}
        {errorSources ? <p className="leads-error">{errorSources}</p> : null}
      </section>

      <section className="panel">
        <div className="leads-toolbar">
          <div className="leads-toolbar-filters">
            <label className="leads-field">
              <span className="leads-field-label">Source</span>
              <select
                className="input"
                value={selectedSourceId ?? ""}
                onChange={(e) => setSelectedSourceId(e.target.value || null)}
                disabled={loadingSources}
              >
                <option value="">All</option>
                {sources.length === 0 ? <option value="" disabled>No sources yet</option> : null}
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="leads-field">
              <span className="leads-field-label">Lead status</span>
              <select
                className="input"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">All</option>
                {LEAD_STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>

            <label className="leads-field">
              <span className="leads-field-label">Converted</span>
              <select
                className="input"
                value={leadConvertedFilter}
                onChange={(e) => setLeadConvertedFilter(e.target.value)}
              >
                <option value="">All</option>
                <option value="Yes">Yes</option>
                <option value="No">No</option>
                <option value="__unset__">Not set</option>
              </select>
            </label>

            <label className="leads-field">
              <span className="leads-field-label">Ad platform</span>
              <select
                className="input"
                value={adPlatform}
                onChange={(e) => setAdPlatform(e.target.value)}
              >
                <option value="">All</option>
                {adPlatformOptions.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="leads-toolbar-search">
            <label className="leads-field leads-field-grow">
              <span className="leads-field-label">Search</span>
              <input
                className="input"
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Comma-separated: name, email, phone, company…"
                spellCheck={false}
                maxLength={200}
              />
            </label>
          </div>
        </div>

        {errorLeads ? <p className="leads-error">{errorLeads}</p> : null}

        {loadingLeads ? <p>Loading...</p> : null}

        <div className="leads-table-top">
          <div className="leads-table-meta">
            Showing <strong>{shownFrom}</strong>–<strong>{shownTo}</strong> of{" "}
            <strong>{leads.total}</strong>
          </div>
          <label className="leads-rows">
            <span className="leads-rows-label">Rows</span>
            <select
              className="input"
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </label>
        </div>

        <div className="leads-table-wrap">
          <table className="leads-table">
            <thead>
              <tr>
                <th className="col-date">
                  <SortTh k="leadDate" />
                </th>
                <th className="col-name">
                  <SortTh k="fullName" />
                </th>
                <th className="col-email">
                  <SortTh k="email" />
                </th>
                <th className="col-phone">
                  <SortTh k="phoneNumber" />
                </th>
                <th className="col-company">
                  <SortTh k="companyName" />
                </th>
                <th className="col-ad-platform">
                  <SortTh k="adPlatform" />
                </th>
                <th className="col-status">
                  <SortTh k="leadStatus" />
                </th>
                <th className="col-reason">
                  <SortTh k="reason" />
                </th>
                <th className="col-call-done">
                  <SortTh k="callDone" />
                </th>
                <th className="col-comment">
                  <SortTh k="comment" />
                </th>
                <th className="col-followup">
                  <SortTh k="followUpRequired" />
                </th>
                <th className="col-converted">
                  <SortTh k="converted" />
                </th>
                <th className="col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!selectedSourceId && leads.total === 0 ? (
                <tr>
                  <td colSpan={13} className="leads-empty-cell">
                    No leads yet. Import an XLSX file to get started.
                  </td>
                </tr>
              ) : shownItems.length === 0 ? (
                <tr>
                  <td colSpan={13} className="leads-empty-cell">
                    No results found. Try changing your search/filters.
                  </td>
                </tr>
              ) : (
                shownItems.map((r) => (
                  <tr key={r.id}>
                    <td className="mono col-date">{fmtYmd(r.leadDate)}</td>
                    <td className="col-name" title={cellText(r.fullName)}>
                      <span className="leads-cell strong">{cellText(r.fullName)}</span>
                    </td>
                    <td className="mono col-email" title={cellText(r.email)}>
                      <span className="leads-cell">{cellText(r.email)}</span>
                    </td>
                    <td className="mono col-phone" title={cellText(r.phoneNumber)}>
                      <span className="leads-cell">{cellText(r.phoneNumber)}</span>
                    </td>
                    <td className="col-company" title={cellText(r.companyName)}>
                      <span className="leads-cell">{cellText(r.companyName)}</span>
                    </td>
                    <td className="col-ad-platform" title={cellText(r.adPlatform ?? r.platform)}>
                      <span className="leads-cell">{cellText(r.adPlatform ?? r.platform)}</span>
                    </td>
                    <td className="col-status">
                      <span
                        className={`lead-badge ${statusClass(r.leadStatus)}`}
                        title={cellText(r.leadStatus)}
                      >
                        {cellText(r.leadStatus)}
                      </span>
                    </td>
                    <td className="leads-reason col-reason" title={cellText(r.reason)}>
                      {cellText(r.reason)}
                    </td>
                    <td className="col-call-done" title={cellText(r.callDone)}>
                      <span className="leads-cell">{cellText(r.callDone)}</span>
                    </td>
                    <td className="col-comment" title={cellText(r.comment)}>
                      <span className="leads-cell">{cellText(r.comment)}</span>
                    </td>
                    <td className="col-followup" title={cellText(r.followUpRequired)}>
                      <span className="leads-cell">{cellText(r.followUpRequired)}</span>
                    </td>
                    <td className="col-converted" title={cellText(r.converted)}>
                      <span className="leads-cell">{cellText(r.converted)}</span>
                    </td>
                    <td className="col-actions">
                      <div className="leads-row-actions">
                        <button
                          type="button"
                          className="btn ghost sm"
                          onClick={() => openEdit(r)}
                          disabled={importing || loadingLeads}
                          aria-label="Edit lead"
                          title="Edit"
                        >
                          <PencilLine size={16} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="btn ghost sm danger"
                          disabled={importing || loadingLeads}
                          aria-label="Delete lead"
                          title="Delete"
                          onClick={() => {
                            const label = (r.fullName ?? r.companyName ?? "this lead").trim();
                            openDeleteModal(r.id, label || "this lead");
                          }}
                        >
                          <Trash2 size={16} aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          totalItems={leads.total}
          pageSize={pageSize}
          currentPage={page}
          onPageChange={setPage}
        />
      </section>

      {editOpen ? (
        <div className="leads-modal-backdrop" role="presentation" onClick={() => closeEdit()}>
          <form
            className="leads-modal"
            onSubmit={(e) => {
              e.preventDefault();
              if (!editId) return;
              void (async () => {
                setEditBusy(true);
                setLocalError(null);
                try {
                  const clientNameForPipeline = (editName || editCompany || "").trim();
                  await updateLead(editId, {
                    leadStatus: (editLeadStatus.trim() || "CREATED").toUpperCase(),
                    reason: editReason.trim() || null,
                    callDone: editCallDone.trim() || null,
                    comment: editComment.trim() || null,
                    followUpRequired: editFollowUpRequired.trim() || null,
                    converted: editConverted.trim() || null,
                  });
                  toastSuccess("Lead updated");
                  const convertedIsYes =
                    normalizeConvertedForSelect(editConverted) === "Yes";
                  closeEdit();
                  if (convertedIsYes) {
                    await openPipelineModal(
                      clientNameForPipeline ? clientNameForPipeline : undefined
                    );
                  }
                } catch (err) {
                  setLocalError(err instanceof Error ? err.message : "Failed to update lead");
                  toastApiError(err, "Failed to update lead");
                } finally {
                  setEditBusy(false);
                }
              })();
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="leads-modal-head">
              <h3>Edit lead</h3>
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => closeEdit()}
                aria-label="Close"
                disabled={editBusy}
              >
                ✕
              </button>
            </div>

            <p className="leads-modal-subtitle">
              {editName ? (
                <>
                  Lead: <strong>{editName}</strong>
                </>
              ) : (
                <>Update notes for this lead.</>
              )}
            </p>

            <label className="leads-modal-field">
              <span className="leads-modal-label">Lead Status</span>
              <select
                className="input"
                value={editLeadStatus}
                onChange={(e) => setEditLeadStatus(e.target.value)}
              >
                {LEAD_STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>

            <label className="leads-modal-field">
              <span className="leads-modal-label">Reason</span>
              <input
                className="input"
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                maxLength={300}
                placeholder="e.g. Not qualified / No budget / Call not picked…"
                autoFocus
              />
            </label>

            <label className="leads-modal-field">
              <span className="leads-modal-label">Call Done</span>
              <input
                className="input"
                value={editCallDone}
                onChange={(e) => setEditCallDone(e.target.value)}
                maxLength={120}
                placeholder='e.g. "Yes" / "No" / "Scheduled"'
              />
            </label>

            <label className="leads-modal-field">
              <span className="leads-modal-label">Comment</span>
              <textarea
                className="input"
                value={editComment}
                onChange={(e) => setEditComment(e.target.value)}
                maxLength={5000}
                rows={4}
                placeholder="Add notes…"
              />
            </label>

            <label className="leads-modal-field">
              <span className="leads-modal-label">Follow up Required</span>
              <input
                className="input"
                value={editFollowUpRequired}
                onChange={(e) => setEditFollowUpRequired(e.target.value)}
                maxLength={120}
                placeholder='e.g. "Yes" / "No" / "After 2 days"'
              />
            </label>

            <label className="leads-modal-field">
              <span className="leads-modal-label">Converted</span>
              <select
                className="input"
                value={editConverted}
                onChange={(e) => setEditConverted(e.target.value)}
              >
                <option value="" disabled>
                  Choose one...
                </option>
                {CONVERTED_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>

            <div className="leads-modal-actions">
              <button type="button" className="btn ghost" onClick={() => closeEdit()} disabled={editBusy}>
                Cancel
              </button>
              <button type="submit" className="btn primary" disabled={editBusy}>
                {editBusy ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {pipelineOpen ? (
        <div
          className="leads-modal-backdrop"
          role="presentation"
          onClick={() => closePipelineModal()}
        >
          <form
            className="leads-modal"
            onSubmit={(e) => {
              e.preventDefault();
              const name = pipelineClientName.trim();
              if (!name) return;
              void (async () => {
                setPipelineBusy(true);
                setLocalError(null);
                try {
                  const isDealLost = pipelineStage === "deal_lost";
                  const isDealWon = pipelineStage === "deal_won";
                  const lostReason = pipelineLostReason.trim();
                  if (isDealLost && !lostReason) {
                    setLocalError("Lost reason is required for Deal Lost");
                    return;
                  }

                  if (pipelineExistingId) {
                    if (isDealLost) {
                      await apiSendJson<PipelineClient>(
                        `/pipeline-clients/${encodeURIComponent(pipelineExistingId)}/mark-lost`,
                        "PATCH",
                        { lostReason }
                      );
                      toastSuccess("Marked as Deal Lost");
                      closePipelineModal();
                    } else {
                      await apiSendJson<PipelineClient>(
                        `/pipeline-clients/${encodeURIComponent(pipelineExistingId)}`,
                        "PATCH",
                        { source: pipelineSource, stage: pipelineStage }
                      );
                      toastSuccess("Client Pipeline updated");
                      closePipelineModal();
                      if (isDealWon) {
                        await openFollowupModalForClient(name);
                      }
                    }
                  } else {
                    if (isDealLost) {
                      // API doesn't allow creating directly into Deal Lost. Create first, then mark lost.
                      const created = await apiSendJson<PipelineClient>("/pipeline-clients", "POST", {
                        clientName: name,
                        source: pipelineSource,
                        stage: "lead_generated",
                      });
                      await apiSendJson<PipelineClient>(
                        `/pipeline-clients/${encodeURIComponent(created.id)}/mark-lost`,
                        "PATCH",
                        { lostReason }
                      );
                      toastSuccess("Marked as Deal Lost");
                      closePipelineModal();
                    } else {
                      const saved = await apiSendJson<PipelineClient>("/pipeline-clients", "POST", {
                        clientName: name,
                        source: pipelineSource,
                        stage: pipelineStage,
                      });
                      toastSuccess("Added to Client Pipeline");
                      closePipelineModal();
                      if (saved.stage === "deal_won" || isDealWon) {
                        await openFollowupModalForClient(saved.clientName);
                      }
                    }
                  }
                } catch (err) {
                  if (isConflictAlreadyExists(err)) {
                    try {
                      const list = await apiGet<PipelineClient[]>("/pipeline-clients");
                      const existing = list.find(
                        (c) => c.clientName.trim().toLowerCase() === name.toLowerCase()
                      );
                      if (!existing) throw err;
                      setPipelineExistingId(existing.id);
                      setPipelineSource(existing.source || pipelineSource);
                      if (pipelineStages.some((s) => s.key === existing.stage)) {
                        setPipelineStage(existing.stage);
                      }
                      if (pipelineStage === "deal_lost") {
                        const lostReason = pipelineLostReason.trim();
                        if (!lostReason) throw new Error("Lost reason is required for Deal Lost");
                        await apiSendJson<PipelineClient>(
                          `/pipeline-clients/${encodeURIComponent(existing.id)}/mark-lost`,
                          "PATCH",
                          { lostReason }
                        );
                        toastSuccess("Marked as Deal Lost");
                        closePipelineModal();
                      } else {
                        await apiSendJson<PipelineClient>(
                          `/pipeline-clients/${encodeURIComponent(existing.id)}`,
                          "PATCH",
                          {
                            source: pipelineSource,
                            stage: pipelineStage,
                          }
                        );
                        toastSuccess("Client Pipeline updated");
                        closePipelineModal();
                        if (pipelineStage === "deal_won") {
                          await openFollowupModalForClient(existing.clientName);
                        }
                      }
                    } catch (inner) {
                      setLocalError(
                        inner instanceof Error ? inner.message : "Failed to update pipeline client"
                      );
                      toastApiError(inner, "Failed to update pipeline client");
                    }
                  } else {
                    setLocalError(err instanceof Error ? err.message : "Failed to add to pipeline");
                    toastApiError(err, "Failed to add to pipeline");
                  }
                } finally {
                  setPipelineBusy(false);
                }
              })();
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="leads-modal-head">
              <h3>Add to Client Pipeline</h3>
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => closePipelineModal()}
                aria-label="Close"
                disabled={pipelineBusy}
              >
                ✕
              </button>
            </div>

            <p className="leads-modal-subtitle">
              Converted is <strong>Yes</strong>.{" "}
              {pipelineExistingId ? (
                <>
                  This client already exists in your pipeline — update details below.
                </>
              ) : (
                <>Add this lead as a client in your pipeline.</>
              )}
            </p>

            <label className="leads-modal-field">
              <span className="leads-modal-label">Client Name</span>
              <input
                className="input"
                value={pipelineClientName}
                onChange={(e) => setPipelineClientName(e.target.value)}
                maxLength={200}
                required
                autoFocus
              />
            </label>

            <label className="leads-modal-field">
              <span className="leads-modal-label">Source</span>
              <select
                className="input"
                value={pipelineSource}
                onChange={(e) => setPipelineSource(e.target.value)}
              >
                <option value="ads">Ads</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="website">Website</option>
                <option value="referral">Referral</option>
                <option value="call">Call</option>
                <option value="other">Other</option>
              </select>
            </label>

            <label className="leads-modal-field">
              <span className="leads-modal-label">Stage</span>
              <select
                className="input"
                value={pipelineStage}
                onChange={(e) => {
                  setPipelineStage(e.target.value);
                  setPipelineLostReason((prev) =>
                    e.target.value === "deal_lost" ? prev : ""
                  );
                }}
              >
                {(pipelineStages.length > 0 ? pipelineStages : [{ key: pipelineStage, label: "Lead Generated", order: 1 }])
                  .slice()
                  .sort((a, b) => a.order - b.order)
                  .map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.order}. {s.label}
                    </option>
                  ))}
              </select>
            </label>

            {pipelineStage === "deal_lost" ? (
              <label className="leads-modal-field">
                <span className="leads-modal-label">Lost reason (required)</span>
                <input
                  className="input"
                  value={pipelineLostReason}
                  onChange={(e) => setPipelineLostReason(e.target.value)}
                  maxLength={300}
                  placeholder="e.g. Budget issue / Not interested / No response"
                  required
                />
              </label>
            ) : null}

            <div className="leads-modal-actions">
              <button
                type="button"
                className="btn ghost"
                onClick={() => closePipelineModal()}
                disabled={pipelineBusy}
              >
                Skip
              </button>
              <button type="submit" className="btn primary" disabled={pipelineBusy}>
                {pipelineBusy
                  ? "Saving…"
                  : pipelineExistingId
                    ? "Update pipeline"
                    : "Add to pipeline"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {followupOpen ? (
        <div
          className="leads-modal-backdrop"
          role="presentation"
          onClick={() => closeFollowupModal()}
        >
          <form
            className="leads-modal"
            onSubmit={(e) => {
              e.preventDefault();
              const name = followupClientName.trim();
              if (!name) return;
              void (async () => {
                setFollowupBusy(true);
                setLocalError(null);
                try {
                  const list = await apiGet<FollowupClient[]>("/followup-clients");
                  const nameLower = name.toLowerCase();
                  const existing = list.find(
                    (x) =>
                      x.track === followupTrack &&
                      x.clientName.trim().toLowerCase() === nameLower
                  );
                  if (existing) {
                    await apiSendJson<FollowupClient>(
                      `/followup-clients/${encodeURIComponent(existing.id)}`,
                      "PATCH",
                      {
                        track: followupTrack,
                        clientName: name,
                        owner: followupOwner.trim() || null,
                      }
                    );
                    toastSuccess("Client Followup updated");
                  } else {
                    await apiSendJson<FollowupClient>("/followup-clients", "POST", {
                      track: followupTrack,
                      clientName: name,
                      owner: followupOwner.trim() || null,
                    });
                    toastSuccess("Added to Client Followup");
                  }
                  closeFollowupModal();
                } catch (err) {
                  setLocalError(err instanceof Error ? err.message : "Failed to save follow-up");
                  toastApiError(err, "Failed to save follow-up");
                } finally {
                  setFollowupBusy(false);
                }
              })();
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="leads-modal-head">
              <h3>{followupIsUpdate ? "Update Client Followup?" : "Add to Client Followup?"}</h3>
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => closeFollowupModal()}
                aria-label="Close"
                disabled={followupBusy}
              >
                ✕
              </button>
            </div>

            <p className="leads-modal-subtitle">
              {!followupReady ? (
                <>Loading follow-up data…</>
              ) : (
                <>
                  <strong>{followupClientName}</strong> is in <strong>Deal Won</strong>.{" "}
                  {followupIsUpdate ? (
                    <>
                      They already have a follow-up entry — update track/owner below, or skip.
                    </>
                  ) : (
                    <>Add them to a follow-up track for daily check-ins, or skip.</>
                  )}
                </>
              )}
            </p>

            <label className="leads-modal-field">
              <span className="leads-modal-label">Track</span>
              <select
                className="input"
                value={followupTrack}
                onChange={(e) => {
                  const next = e.target.value;
                  setFollowupTrack(next);
                  const nameLower = followupClientName.trim().toLowerCase();
                  const existing =
                    nameLower
                      ? followupEntries.find(
                          (x) =>
                            x.track === next &&
                            x.clientName.trim().toLowerCase() === nameLower
                        ) ?? null
                      : null;
                  if (existing) {
                    setFollowupIsUpdate(true);
                    setFollowupOwner(existing.owner ?? "");
                  } else {
                    setFollowupIsUpdate(false);
                    setFollowupOwner("");
                  }
                }}
                disabled={!followupReady || followupBusy}
              >
                {VPDM_TRACKS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>

            <label className="leads-modal-field">
              <span className="leads-modal-label">Owner (optional)</span>
              <input
                className="input"
                value={followupOwner}
                onChange={(e) => setFollowupOwner(e.target.value)}
                maxLength={120}
                placeholder="e.g. team member name"
                disabled={!followupReady || followupBusy}
              />
            </label>

            <div className="leads-modal-actions">
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  if (followupBusy || !followupReady) return;
                  const name = followupClientName.trim();
                  closeFollowupModal();
                  void openPipelineModal(name || undefined);
                }}
                disabled={followupBusy || !followupReady}
              >
                Back to Client Pipeline
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => closeFollowupModal()}
                disabled={followupBusy}
              >
                Skip
              </button>
              <button type="submit" className="btn primary" disabled={followupBusy || !followupReady}>
                {followupBusy
                  ? "Saving…"
                  : followupIsUpdate
                    ? "Update follow-up"
                    : "Add to follow-up"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {deleteOpen ? (
        <div className="leads-modal-backdrop" role="presentation" onClick={() => closeDeleteModal()}>
          <form
            className="leads-modal"
            onSubmit={(e) => {
              e.preventDefault();
              if (!deleteId) return;
              void (async () => {
                setDeleteBusy(true);
                setLocalError(null);
                try {
                  await deleteLead(deleteId);
                  toastSuccess("Lead deleted");
                  closeDeleteModal();
                } catch (err) {
                  setLocalError(err instanceof Error ? err.message : "Failed to delete lead");
                  toastApiError(err, "Failed to delete lead");
                } finally {
                  setDeleteBusy(false);
                }
              })();
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="leads-modal-head">
              <h3>Delete lead?</h3>
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => closeDeleteModal()}
                aria-label="Close"
                disabled={deleteBusy}
              >
                ✕
              </button>
            </div>

            <p className="leads-modal-subtitle">
              Delete <strong>{deleteLabel || "this lead"}</strong>? This cannot be undone.
            </p>

            <div className="leads-modal-actions">
              <button type="button" className="btn ghost" onClick={() => closeDeleteModal()} disabled={deleteBusy}>
                Cancel
              </button>
              <button type="submit" className="btn danger" disabled={deleteBusy}>
                {deleteBusy ? "Deleting…" : "Delete"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}


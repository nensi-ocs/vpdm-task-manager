import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import { VPDM_TRACKS } from "../vpdmCatalog";
import { useFollowupClients } from "../useFollowupClients";
import { toastApiError, toastSuccess } from "../toast";
import "./followup-clients-page.css";
import { PencilLine, Trash2, X } from "lucide-react";

export function FollowupClientsPage() {
  const { user } = useAuth();
  const { clients, grouped, loading, error, addClient, updateClient, removeClient } =
    useFollowupClients(user?.id);
  const [track, setTrack] = useState<string>(VPDM_TRACKS[0]);
  const [clientName, setClientName] = useState("");
  const [owner, setOwner] = useState("");
  const [busy, setBusy] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editTrack, setEditTrack] = useState<string>(VPDM_TRACKS[0]);
  const [editClientName, setEditClientName] = useState("");
  const [editOwner, setEditOwner] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const total = useMemo(() => {
    let n = 0;
    for (const t of VPDM_TRACKS) n += grouped.get(t)?.length ?? 0;
    return n;
  }, [grouped]);

  const followupAddFormIsUpdate = useMemo(() => {
    const n = clientName.trim().toLowerCase();
    if (!n) return false;
    return clients.some(
      (c) => c.track === track && c.clientName.trim().toLowerCase() === n
    );
  }, [clients, track, clientName]);

  useEffect(() => {
    const n = clientName.trim().toLowerCase();
    if (!n) return;
    const hit = clients.find(
      (c) => c.track === track && c.clientName.trim().toLowerCase() === n
    );
    if (hit) setOwner(hit.owner ?? "");
  }, [clients, track, clientName]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const name = clientName.trim();
    if (!name) return;
    setBusy(true);
    setLocalError(null);
    try {
      const nameLower = name.toLowerCase();
      const existing = clients.find(
        (c) => c.track === track && c.clientName.trim().toLowerCase() === nameLower
      );
      if (existing) {
        await updateClient(existing.id, {
          track,
          clientName: name,
          owner: owner.trim() || null,
        });
        toastSuccess("Client updated");
      } else {
        await addClient(track, name, owner.trim() || null);
        toastSuccess("Client added");
      }
      setClientName("");
      setOwner("");
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Failed to save client");
      toastApiError(err, "Failed to save client");
    } finally {
      setBusy(false);
    }
  }

  async function onSaveEdit() {
    if (!editId) return;
    const nextName = editClientName.trim();
    if (!nextName) return;
    setBusy(true);
    setLocalError(null);
    try {
      await updateClient(editId, {
        track: editTrack,
        clientName: nextName,
        owner: editOwner.trim() || null,
      });
      setEditModalOpen(false);
      setEditId(null);
      setEditTrack(VPDM_TRACKS[0]);
      setEditClientName("");
      setEditOwner("");
      toastSuccess("Client updated");
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Failed to update client");
      toastApiError(err, "Failed to update client");
    } finally {
      setBusy(false);
    }
  }

  function onOpenEdit(c: { id: string; track: string; clientName: string; owner: string | null }) {
    setEditId(c.id);
    setEditTrack(c.track);
    setEditClientName(c.clientName);
    setEditOwner(c.owner ?? "");
    setEditModalOpen(true);
  }

  function onCancelEdit() {
    setEditModalOpen(false);
    setEditId(null);
    setEditTrack(VPDM_TRACKS[0]);
    setEditClientName("");
    setEditOwner("");
  }

  return (
    <main className="followup-page">
      <section className="panel followup-intro-panel">
        <h2 className="followup-title">Client Followup Details</h2>
        <p className="followup-subtitle">
          Add clients under Amazon/Flipkart followup tracks. Total clients: {total}
        </p>
        <form onSubmit={(e) => void onSubmit(e)} className="followup-add-form">
          <select className="input" value={track} onChange={(e) => setTrack(e.target.value)}>
            {VPDM_TRACKS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input
            className="input"
            placeholder="Client name"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            maxLength={200}
          />
          <input
            className="input"
            placeholder="Owner (optional)"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            maxLength={120}
          />
          <button type="submit" className="btn primary" disabled={busy}>
            {followupAddFormIsUpdate ? "Update Client" : "Add Client"}
          </button>
        </form>
        {localError ? <p style={{ color: "var(--danger)" }}>{localError}</p> : null}
        {error ? <p style={{ color: "var(--danger)" }}>{error}</p> : null}
      </section>

      <section className="panel">
        <h3 className="followup-section-title">Track-wise Clients</h3>
        {loading ? (
          <p>Loading...</p>
        ) : (
          <div className="followup-track-grid">
            {VPDM_TRACKS.map((t) => {
              const list = grouped.get(t) ?? [];
              return (
                <article key={t} className="followup-track-card">
                  <h4 className="followup-track-head">{t}</h4>
                  {list.length === 0 ? (
                    <p className="followup-empty">
                      No clients yet.
                    </p>
                  ) : (
                    <ul className="followup-list">
                      {list.map((c) => (
                        <li key={c.id} className="followup-list-item">
                          <span className="followup-client-name">{c.clientName}</span>
                          <span className="followup-client-owner">
                            {c.owner ? `(${c.owner})` : "(-)"}
                          </span>
                          <button
                            type="button"
                            className="btn ghost sm"
                            title="Edit client"
                            onClick={() =>
                              onOpenEdit({
                                id: c.id,
                                track: c.track,
                                clientName: c.clientName,
                                owner: c.owner ?? null,
                              })
                            }
                          >
                            <PencilLine size={16} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className="btn ghost sm"
                            title="Delete client"
                            onClick={async () => {
                              try {
                                await removeClient(c.id);
                                toastSuccess("Client deleted");
                              } catch (err) {
                                toastApiError(err, "Failed to delete client");
                              }
                            }}
                          >
                            <Trash2 size={16} aria-hidden="true" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {editModalOpen ? (
        <div
          className="followup-modal-backdrop"
          role="presentation"
          onClick={() => onCancelEdit()}
        >
          <form
            className="followup-modal"
            onSubmit={(e) => {
              e.preventDefault();
              void onSaveEdit();
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="followup-modal-head">
              <h3>Edit Client</h3>
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => onCancelEdit()}
                aria-label="Close"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            <label className="field">
              <span className="label">Track</span>
              <select
                className="input"
                value={editTrack}
                onChange={(e) => setEditTrack(e.target.value)}
              >
                {VPDM_TRACKS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="label">Client name</span>
              <input
                className="input"
                value={editClientName}
                onChange={(e) => setEditClientName(e.target.value)}
                maxLength={200}
                required
              />
            </label>

            <label className="field">
              <span className="label">Owner (optional)</span>
              <input
                className="input"
                value={editOwner}
                onChange={(e) => setEditOwner(e.target.value)}
                maxLength={120}
              />
            </label>

            {localError ? <p className="category-error">{localError}</p> : null}

            <div className="followup-modal-actions">
              <button type="button" className="btn ghost" onClick={() => onCancelEdit()}>
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


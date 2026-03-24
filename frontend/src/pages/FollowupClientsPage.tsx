import { useMemo, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import { VPDM_TRACKS } from "../vpdmCatalog";
import { useFollowupClients } from "../useFollowupClients";
import "./followup-clients-page.css";
import { PencilLine, Trash2, X } from "lucide-react";

export function FollowupClientsPage() {
  const { user } = useAuth();
  const { grouped, loading, error, addClient, updateClient, removeClient } =
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

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const name = clientName.trim();
    if (!name) return;
    setBusy(true);
    setLocalError(null);
    try {
      await addClient(track, name, owner.trim() || null);
      setClientName("");
      setOwner("");
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Failed to add client");
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
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Failed to update client");
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
    <main style={{ padding: "1rem 1.1rem 2rem" }}>
      <section className="panel" style={{ marginBottom: "1rem" }}>
        <h2 style={{ marginTop: 0 }}>Client Followup Details</h2>
        <p style={{ marginTop: 0, color: "var(--text-muted)" }}>
          Add clients under Amazon/Flipkart followup tracks. Total clients: {total}
        </p>
        <form
          onSubmit={(e) => void onSubmit(e)}
          style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1.5fr auto", gap: "0.5rem" }}
        >
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
            Add Client
          </button>
        </form>
        {localError ? <p style={{ color: "var(--danger)" }}>{localError}</p> : null}
        {error ? <p style={{ color: "var(--danger)" }}>{error}</p> : null}
      </section>

      <section className="panel">
        <h3 style={{ marginTop: 0 }}>Track-wise Clients</h3>
        {loading ? (
          <p>Loading...</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(290px,1fr))", gap: "0.7rem" }}>
            {VPDM_TRACKS.map((t) => {
              const list = grouped.get(t) ?? [];
              return (
                <article
                  key={t}
                  style={{ border: "1px solid var(--border)", borderRadius: "10px", overflow: "hidden" }}
                >
                  <h4 style={{ margin: 0, padding: "0.55rem 0.7rem", background: "#d8eee8" }}>{t}</h4>
                  {list.length === 0 ? (
                    <p style={{ margin: 0, padding: "0.65rem 0.7rem", color: "var(--text-muted)" }}>
                      No clients yet.
                    </p>
                  ) : (
                    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                      {list.map((c) => (
                        <li
                          key={c.id}
                          style={{
                            borderTop: "1px solid var(--border)",
                            display: "flex",
                            alignItems: "center",
                            gap: "0.45rem",
                            padding: "0.45rem 0.6rem",
                          }}
                        >
                          <span style={{ flex: 1 }}>{c.clientName}</span>
                          <span style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>
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
                            onClick={() => void removeClient(c.id)}
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


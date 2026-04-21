import { useEffect, useMemo, useState } from "react";
import { PencilLine, Trash2 } from "lucide-react";
import { Pagination } from "../components/Pagination";
import { apiDelete, apiGet, apiSendJson } from "../api";
import { toastApiError, toastSuccess } from "../toast";
import "./important-client-leads-page.css";

type ImportantClientLead = {
  id: string;
  name: string;
  companyName: string;
  brandName: string;
  categories: string;
  platform: string;
  location: string;
  monthSale: string;
  mobileNo: string;
  email: string;
  comment: string;
  createdAt: string;
  updatedAt?: string;
};

function normalizeEmail(v: string): string {
  return v.trim().toLowerCase();
}

function normalizePhone(v: string): string {
  return v.replace(/\s+/g, "").trim();
}

type SortKey =
  | "name"
  | "companyName"
  | "brandName"
  | "categories"
  | "platform"
  | "location"
  | "monthSale"
  | "mobileNo"
  | "email"
  | "comment"
  | "createdAt";

type SortDir = "asc" | "desc";

function cmpText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
}

function sortLabel(k: SortKey): string {
  if (k === "name") return "Name";
  if (k === "companyName") return "Company Name";
  if (k === "brandName") return "Brand Name";
  if (k === "categories") return "Categories";
  if (k === "platform") return "Platform";
  if (k === "location") return "Location";
  if (k === "monthSale") return "Month Sale";
  if (k === "mobileNo") return "Mobile No";
  if (k === "email") return "Email";
  if (k === "comment") return "Comment";
  return "Created";
}

export function ImportantClientLeadsPage() {
  const [items, setItems] = useState<ImportantClientLead[]>([]);
  const [loading, setLoading] = useState(true);

  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1); // 1-based
  const [pageSize, setPageSize] = useState(10);
  const [q, setQ] = useState("");
  // sortKey: null means "no explicit sort" (use default createdAt desc)
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [brandName, setBrandName] = useState("");
  const [categories, setCategories] = useState("");
  const [platform, setPlatform] = useState("");
  const [location, setLocation] = useState("");
  const [monthSale, setMonthSale] = useState("");
  const [mobileNo, setMobileNo] = useState("");
  const [email, setEmail] = useState("");
  const [comment, setComment] = useState("");

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const list = await apiGet<ImportantClientLead[]>("/important-client-leads");
        setItems(list);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
        toastApiError(err, "Failed to load important client leads");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filteredAndSorted = useMemo(() => {
    const tokens = q
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0)
      .slice(0, 25);
    const filtered =
      tokens.length === 0
        ? items
        : items.filter((x) => {
            const hay =
              `${x.name} ${x.companyName} ${x.brandName} ${x.categories} ${x.platform} ${x.location} ${x.monthSale} ${x.mobileNo} ${x.email} ${x.comment}`.toLowerCase();
            return tokens.some((t) => hay.includes(t));
          });

    const effectiveKey: SortKey = sortKey ?? "createdAt";
    const effectiveDir: SortDir = sortKey ? sortDir : "desc";
    const dirMul = effectiveDir === "asc" ? 1 : -1;
    const get = (x: ImportantClientLead): string => {
      const v = x[effectiveKey];
      return (v ?? "").toString().trim();
    };

    const out = [...filtered].sort((a, b) => {
      const av = get(a);
      const bv = get(b);
      const aEmpty = av === "" || av === "-";
      const bEmpty = bv === "" || bv === "-";
      if (aEmpty && bEmpty) return b.createdAt.localeCompare(a.createdAt);
      if (aEmpty) return 1;
      if (bEmpty) return -1;
      const c = cmpText(av, bv);
      if (c !== 0) return c * dirMul;
      return b.createdAt.localeCompare(a.createdAt);
    });

    return out;
  }, [items, q, sortDir, sortKey]);

  const totalItems = filteredAndSorted.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const end = start + pageSize;
  const pagedItems = filteredAndSorted.slice(start, end);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safePage]);

  useEffect(() => {
    setPage(1);
  }, [q, pageSize, sortKey, sortDir]);

  function toggleSort(nextKey: SortKey) {
    setSortKey((prevKey) => {
      // New column: start ASC
      if (prevKey !== nextKey) {
        setSortDir("asc");
        return nextKey;
      }

      // Same column: ASC -> DESC -> remove (default)
      if (sortDir === "asc") {
        setSortDir("desc");
        return nextKey;
      }
      // remove explicit sort
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
        className={`icl-sort ${isOn ? "on" : ""}`}
        onClick={() => toggleSort(k)}
        aria-label={`Sort by ${sortLabel(k)} ${
          isOn ? (sortDir === "asc" ? "descending" : "remove sort") : "ascending"
        }`}
        title={`Sort by ${sortLabel(k)}`}
      >
        <span className="icl-sort-text">{sortLabel(k)}</span>
        <span className="icl-sort-icon" aria-hidden="true">
          {sortGlyph(k)}
        </span>
      </button>
    );
  }

  function resetForm() {
    setName("");
    setCompanyName("");
    setBrandName("");
    setCategories("");
    setPlatform("");
    setLocation("");
    setMonthSale("");
    setMobileNo("");
    setEmail("");
    setComment("");
  }

  function closeAdd() {
    if (busy) return;
    setAddOpen(false);
    setEditId(null);
    setError(null);
    resetForm();
  }

  function openEdit(row: ImportantClientLead) {
    setError(null);
    setEditId(row.id);
    setName(row.name ?? "");
    setCompanyName(row.companyName ?? "");
    setBrandName(row.brandName ?? "");
    setCategories(row.categories ?? "");
    setPlatform(row.platform ?? "");
    setLocation(row.location ?? "");
    setMonthSale(row.monthSale ?? "");
    setMobileNo(row.mobileNo ?? "");
    setEmail(row.email ?? "");
    setComment(row.comment ?? "");
    setAddOpen(true);
  }

  function remove(id: string) {
    void (async () => {
      try {
        await apiDelete(`/important-client-leads/${encodeURIComponent(id)}`);
        setItems((prev) => prev.filter((x) => x.id !== id));
        toastSuccess("Deleted");
      } catch (err) {
        toastApiError(err, "Failed to delete");
      }
    })();
  }

  return (
    <main className="icl-page">
      <section className="panel icl-head">
        <div className="icl-title-row">
          <div>
            <h2 className="icl-title">Important Client Lead</h2>
            <p className="icl-subtitle">
              Add and manage important client leads.
            </p>
          </div>
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              setError(null);
              setAddOpen(true);
            }}
          >
            Add
          </button>
        </div>
        {error ? <p className="icl-error">{error}</p> : null}
      </section>

      <section className="panel">
        {loading ? <p className="icl-empty">Loading…</p> : null}
        {!loading ? (
          <>
            <div className="icl-table-top">
              <div className="icl-table-top-row icl-table-top-row-search">
                <label className="icl-search">
                  <span className="icl-search-label">Search</span>
                  <input
                    className="input"
                    type="search"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search name, email, mobile, platform…"
                    maxLength={200}
                    spellCheck={false}
                  />
                </label>
              </div>

              <div className="icl-table-top-row">
                <div className="icl-table-meta">
                  Showing <strong>{totalItems === 0 ? 0 : start + 1}</strong>–<strong>{Math.min(totalItems, end)}</strong>{" "}
                  of <strong>{totalItems}</strong>
                </div>
                <label className="icl-rows">
                  <span className="icl-rows-label">Rows</span>
                  <select
                    className="input"
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="icl-table-wrap">
              <table className="icl-table">
                <thead>
                  <tr>
                    <th className="col-no">No</th>
                    <th className="col-name">
                      <SortTh k="name" />
                    </th>
                    <th className="col-company">
                      <SortTh k="companyName" />
                    </th>
                    <th className="col-brand">
                      <SortTh k="brandName" />
                    </th>
                    <th className="col-categories">
                      <SortTh k="categories" />
                    </th>
                    <th className="col-platform">
                      <SortTh k="platform" />
                    </th>
                    <th className="col-location">
                      <SortTh k="location" />
                    </th>
                    <th className="col-month-sale">
                      <SortTh k="monthSale" />
                    </th>
                    <th className="col-mobile">
                      <SortTh k="mobileNo" />
                    </th>
                    <th className="col-email">
                      <SortTh k="email" />
                    </th>
                    <th className="col-comment">
                      <SortTh k="comment" />
                    </th>
                    <th className="col-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedItems.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="icl-empty-cell">
                        {q.trim()
                          ? "No results found. Try changing your search."
                          : "No important client leads yet. Click Add."}
                      </td>
                    </tr>
                  ) : (
                    pagedItems.map((r, idx) => (
                      <tr key={r.id}>
                        <td className="mono col-no">{start + idx + 1}</td>
                        <td className="col-name" title={r.name}>
                          <span className="icl-cell strong">{r.name}</span>
                        </td>
                        <td className="col-company" title={r.companyName}>
                          <span className="icl-cell">{r.companyName || "-"}</span>
                        </td>
                        <td className="col-brand" title={r.brandName}>
                          <span className="icl-cell">{r.brandName || "-"}</span>
                        </td>
                        <td className="col-categories" title={r.categories}>
                          <span className="icl-cell">{r.categories || "-"}</span>
                        </td>
                        <td className="col-platform" title={r.platform}>
                          <span className="icl-cell">{r.platform || "-"}</span>
                        </td>
                        <td className="col-location" title={r.location}>
                          <span className="icl-cell">{r.location || "-"}</span>
                        </td>
                        <td className="col-month-sale" title={r.monthSale}>
                          <span className="icl-cell">{r.monthSale || "-"}</span>
                        </td>
                        <td className="mono col-mobile" title={r.mobileNo}>
                          <span className="icl-cell">{r.mobileNo || "-"}</span>
                        </td>
                        <td className="mono col-email" title={r.email}>
                          <span className="icl-cell">{r.email || "-"}</span>
                        </td>
                        <td className="col-comment" title={r.comment}>
                          <span className="icl-cell">{r.comment || "-"}</span>
                        </td>
                        <td className="col-actions">
                          <div className="icl-row-actions">
                            <button
                              type="button"
                              className="btn ghost sm"
                              onClick={() => openEdit(r)}
                              aria-label="Edit"
                              title="Edit"
                            >
                              <PencilLine size={16} aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              className="btn ghost sm danger"
                              onClick={() => remove(r.id)}
                              aria-label="Delete"
                              title="Delete"
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
              totalItems={totalItems}
              pageSize={pageSize}
              currentPage={safePage}
              onPageChange={setPage}
            />
          </>
        ) : null}
      </section>

      {addOpen ? (
        <div
          className="icl-modal-backdrop"
          role="presentation"
          onClick={() => closeAdd()}
        >
          <form
            className="icl-modal"
            onSubmit={(e) => {
              e.preventDefault();
              void (async () => {
                setBusy(true);
                setError(null);
                try {
                  const nameOk = name.trim();
                  if (!nameOk) {
                    setError("Name is required");
                    return;
                  }

                  const emailNorm = normalizeEmail(email);
                  const phoneNorm = normalizePhone(mobileNo);

                  if (editId) {
                    const updated = await apiSendJson<ImportantClientLead>(
                      `/important-client-leads/${encodeURIComponent(editId)}`,
                      "PATCH",
                      {
                        name: nameOk,
                        companyName: companyName.trim(),
                        brandName: brandName.trim(),
                        categories: categories.trim(),
                        platform: platform.trim(),
                        location: location.trim(),
                        monthSale: monthSale.trim(),
                        mobileNo: phoneNorm,
                        email: emailNorm,
                        comment: comment.trim(),
                      }
                    );
                    setItems((prev) => prev.map((x) => (x.id === editId ? updated : x)));
                    toastSuccess("Updated");
                  } else {
                    const created = await apiSendJson<ImportantClientLead>(
                      "/important-client-leads",
                      "POST",
                      {
                        name: nameOk,
                        companyName: companyName.trim(),
                        brandName: brandName.trim(),
                        categories: categories.trim(),
                        platform: platform.trim(),
                        location: location.trim(),
                        monthSale: monthSale.trim(),
                        mobileNo: phoneNorm,
                        email: emailNorm,
                        comment: comment.trim(),
                      }
                    );
                    setItems((prev) => [created, ...prev]);
                    toastSuccess("Added");
                  }
                  closeAdd();
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Failed to save");
                  toastApiError(err, "Failed to save");
                } finally {
                  setBusy(false);
                }
              })();
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="icl-modal-head">
              <h3>{editId ? "Edit Important Client Lead" : "Add Important Client Lead"}</h3>
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => closeAdd()}
                aria-label="Close"
                disabled={busy}
              >
                ✕
              </button>
            </div>

            <div className="icl-grid">
              <label className="icl-field">
                <span className="icl-label">Name *</span>
                <input
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={200}
                  required
                  autoFocus
                />
              </label>

              <label className="icl-field">
                <span className="icl-label">Company Name</span>
                <input
                  className="input"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  maxLength={200}
                />
              </label>

              <label className="icl-field">
                <span className="icl-label">Brand Name</span>
                <input
                  className="input"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  maxLength={200}
                />
              </label>

              <label className="icl-field">
                <span className="icl-label">Categories</span>
                <input
                  className="input"
                  value={categories}
                  onChange={(e) => setCategories(e.target.value)}
                  maxLength={200}
                  placeholder="e.g. Clothing, Electronics"
                />
              </label>

              <label className="icl-field">
                <span className="icl-label">Platform</span>
                <input
                  className="input"
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value)}
                  maxLength={120}
                  placeholder="e.g. Instagram, Facebook"
                />
              </label>

              <label className="icl-field">
                <span className="icl-label">Location</span>
                <input
                  className="input"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  maxLength={120}
                />
              </label>

              <label className="icl-field">
                <span className="icl-label">Month Sale</span>
                <input
                  className="input"
                  value={monthSale}
                  onChange={(e) => setMonthSale(e.target.value)}
                  maxLength={120}
                  placeholder="e.g. 2L / 1,50,000"
                />
              </label>

              <label className="icl-field">
                <span className="icl-label">Mobile No</span>
                <input
                  className="input"
                  value={mobileNo}
                  onChange={(e) => setMobileNo(e.target.value)}
                  maxLength={30}
                  inputMode="tel"
                />
              </label>

              <label className="icl-field">
                <span className="icl-label">Email</span>
                <input
                  className="input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  maxLength={200}
                  inputMode="email"
                />
              </label>

              <label className="icl-field icl-field-span">
                <span className="icl-label">Comment</span>
                <textarea
                  className="input"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  maxLength={5000}
                  rows={4}
                />
              </label>
            </div>

            {error ? <p className="icl-error">{error}</p> : null}

            <div className="icl-modal-actions">
              <button
                type="button"
                className="btn ghost"
                onClick={() => closeAdd()}
                disabled={busy}
              >
                Cancel
              </button>
              <button type="submit" className="btn primary" disabled={busy}>
                {busy ? "Saving…" : editId ? "Update" : "Save"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}


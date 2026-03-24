import { useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import { useCategories } from "../useCategories";
import "./categories-page.css";
import { PencilLine, Trash2 } from "lucide-react";

export function CategoriesPage() {
  const { user } = useAuth();
  const { categories, loading, error, addCategory, updateCategory, removeCategory } =
    useCategories(user?.id);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    setLocalError(null);
    setSaving(true);
    try {
      await addCategory(n);
      setName("");
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Failed to add category");
    } finally {
      setSaving(false);
    }
  }

  async function onSaveEdit() {
    if (!editingId) return;
    const n = editingName.trim();
    if (!n) return;
    setLocalError(null);
    setSaving(true);
    try {
      await updateCategory(editingId, n);
      setEditingId(null);
      setEditingName("");
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Failed to update category");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="categories-page">
      <section className="panel category-manage-panel">
        <h2 className="category-title">Category Management</h2>
        <p className="category-subtitle">
          Add categories here and they will appear in the task modal dropdown.
        </p>
        <form className="category-add-form" onSubmit={(e) => void onSubmit(e)}>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Category name"
            maxLength={120}
          />
          <button type="submit" className="btn primary" disabled={saving}>
            Add Category
          </button>
        </form>
        {localError ? <p className="category-error">{localError}</p> : null}
        {error ? <p className="category-error">{error}</p> : null}
      </section>

      <section className="panel">
        <h3 className="saved-title">Saved Categories</h3>
        {loading ? (
          <p>Loading...</p>
        ) : categories.length === 0 ? (
          <p className="saved-empty">No categories yet.</p>
        ) : (
          <div className="categories-table-wrap">
            <table className="categories-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Category</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c, idx) => {
                  const isEditing = editingId === c.id;
                  return (
                    <tr key={c.id}>
                      <td className="col-num">{idx + 1}</td>
                      <td className="col-category">
                        {isEditing ? (
                          <input
                            className="input category-edit-input"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            maxLength={120}
                          />
                        ) : (
                          c.name
                        )}
                      </td>
                      <td className="col-actions">
                        {isEditing ? (
                          <div className="row-actions">
                            <button
                              type="button"
                              className="btn primary sm"
                              onClick={() => void onSaveEdit()}
                              disabled={saving}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              className="btn ghost sm"
                              onClick={() => {
                                setEditingId(null);
                                setEditingName("");
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="row-actions">
                            <button
                              type="button"
                              className="btn ghost sm table-icon-btn"
                              title="Edit category"
                              onClick={() => {
                                setEditingId(c.id);
                                setEditingName(c.name);
                              }}
                            >
                              <PencilLine size={16} aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              className="btn ghost sm table-icon-btn"
                              title="Delete category"
                              onClick={() => void removeCategory(c.id)}
                            >
                              <Trash2 size={16} aria-hidden="true" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

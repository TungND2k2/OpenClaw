import { useState, useEffect, useCallback } from "react";
import { apiFetch, apiPost, apiPut, apiDelete } from "../api";
import { Modal } from "../components/Modal";

// ── Field config ─────────────────────────────────────────────

export interface FieldDef {
  key: string;
  label: string;
  type: "text" | "textarea" | "json" | "select" | "number";
  options?: string[];
  placeholder?: string;
  required?: boolean;
  defaultValue?: string;
}

export interface ColDef {
  key: string;
  label: string;
  render?: (val: any, row: any) => React.ReactNode;
}

export interface CrudPageConfig {
  title: string;
  icon: string;
  listEndpoint: (botId: string) => string;     // GET
  createEndpoint: (botId: string) => string;    // POST
  updateEndpoint: (id: string) => string;       // PUT
  deleteEndpoint: (id: string) => string;       // DELETE
  columns: ColDef[];
  formFields: FieldDef[];
  description?: string;
}

// ── Form ─────────────────────────────────────────────────────

function FormField({ field, value, onChange }: { field: FieldDef; value: string; onChange: (v: string) => void }) {
  const base = "w-full bg-[#0d1117] border border-[#30363d] text-[#e6edf3] text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-[#388bfd] placeholder-[#8b949e]/60 transition-colors";

  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-[#8b949e]">
        {field.label}
        {field.required && <span className="text-[#f85149] ml-0.5">*</span>}
      </label>
      {field.type === "select" ? (
        <select value={value} onChange={e => onChange(e.target.value)} className={base + " cursor-pointer"}>
          <option value="">— Select —</option>
          {field.options?.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : field.type === "textarea" ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={3}
          className={base + " resize-y"}
        />
      ) : field.type === "json" ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder ?? "[]"}
          rows={5}
          className={base + " resize-y font-mono text-xs"}
        />
      ) : (
        <input
          type={field.type === "number" ? "number" : "text"}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder}
          className={base}
        />
      )}
    </div>
  );
}

// ── CrudPage ─────────────────────────────────────────────────

interface CrudPageProps {
  config: CrudPageConfig;
  botId: string;
}

export function CrudPage({ config, botId }: CrudPageProps) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    if (!botId) return;
    setLoading(true);
    apiFetch(config.listEndpoint(botId))
      .then(rows => setData(Array.isArray(rows) ? rows : []))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [botId, config]);

  useEffect(() => { load(); }, [load]);

  const initForm = (row?: any) => {
    const init: Record<string, string> = {};
    for (const f of config.formFields) {
      if (row) {
        const v = row[f.key];
        init[f.key] = f.type === "json" ? JSON.stringify(v ?? (f.defaultValue ? JSON.parse(f.defaultValue) : []), null, 2) : String(v ?? "");
      } else {
        init[f.key] = f.defaultValue ?? "";
      }
    }
    return init;
  };

  const openCreate = () => {
    setForm(initForm());
    setEditTarget(null);
    setError("");
    setModalMode("create");
  };

  const openEdit = (row: any) => {
    setForm(initForm(row));
    setEditTarget(row);
    setError("");
    setModalMode("edit");
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const body: Record<string, any> = {};
      for (const f of config.formFields) {
        const raw = form[f.key];
        if (f.type === "json") {
          try { body[f.key] = JSON.parse(raw || "null"); }
          catch { throw new Error(`"${f.label}" — invalid JSON`); }
        } else if (f.type === "number") {
          body[f.key] = raw ? Number(raw) : undefined;
        } else {
          body[f.key] = raw || undefined;
        }
      }
      if (modalMode === "create") {
        await apiPost(config.createEndpoint(botId), body);
      } else if (editTarget) {
        await apiPut(config.updateEndpoint(editTarget.id), body);
      }
      setModalMode(null);
      load();
    } catch (e: any) {
      setError(e.message ?? "An error occurred");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiDelete(config.deleteEndpoint(deleteTarget.id));
      setDeleteTarget(null);
      load();
    } catch (e: any) {
      setError(e.message ?? "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[#e6edf3] flex items-center gap-2">
            <span>{config.icon}</span>{config.title}
          </h2>
          {config.description && <p className="text-sm text-[#8b949e] mt-0.5">{config.description}</p>}
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 bg-[#238636] hover:bg-[#2ea043] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + New {config.title.replace(/s$/, "")}
        </button>
      </div>

      {/* Table */}
      <div className="bg-[#161b22] border border-[#21262d] rounded-xl overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-[#8b949e] text-sm">Loading…</div>
        ) : data.length === 0 ? (
          <div className="py-16 text-center">
            <div className="text-3xl mb-3 opacity-30">{config.icon}</div>
            <p className="text-[#8b949e] text-sm">No {config.title.toLowerCase()} yet</p>
            <button onClick={openCreate} className="mt-3 text-xs text-[#388bfd] hover:underline">
              Create the first one →
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#21262d]">
                  {config.columns.map(col => (
                    <th key={col.key} className="px-4 py-3 text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider whitespace-nowrap">
                      {col.label}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[#8b949e] uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#21262d]">
                {data.map((row, i) => (
                  <tr key={row.id ?? i} className="hover:bg-[#1c2128] transition-colors group">
                    {config.columns.map(col => (
                      <td key={col.key} className="px-4 py-3 max-w-xs">
                        {col.render
                          ? col.render(row[col.key], row)
                          : typeof row[col.key] === "object" && row[col.key] !== null
                            ? <code className="text-xs text-[#79c0ff] bg-[#0d1117] px-2 py-0.5 rounded font-mono">
                                {JSON.stringify(row[col.key]).slice(0, 60)}{JSON.stringify(row[col.key]).length > 60 ? "…" : ""}
                              </code>
                            : <span className="text-[#e6edf3] truncate block max-w-[200px]">{String(row[col.key] ?? "—")}</span>
                        }
                      </td>
                    ))}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => openEdit(row)}
                          className="px-2.5 py-1 text-xs text-[#8b949e] hover:text-[#e6edf3] border border-[#30363d] hover:border-[#8b949e] rounded-md transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setDeleteTarget(row)}
                          className="px-2.5 py-1 text-xs text-[#f85149] hover:text-white border border-[#f85149]/30 hover:bg-[#da3633] hover:border-[#da3633] rounded-md transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-2.5 border-t border-[#21262d] text-xs text-[#8b949e]">{data.length} record{data.length !== 1 ? "s" : ""}</div>
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      <Modal
        title={modalMode === "create" ? `New ${config.title.replace(/s$/, "")}` : `Edit ${config.title.replace(/s$/, "")}`}
        open={modalMode !== null}
        onClose={() => setModalMode(null)}
        onConfirm={handleSave}
        loading={saving}
      >
        <div className="space-y-4">
          {error && (
            <div className="bg-[#3d1a1a] border border-[#da3633]/50 text-[#f85149] text-xs rounded-lg px-3 py-2">{error}</div>
          )}
          {config.formFields.map(field => (
            <FormField
              key={field.key}
              field={field}
              value={form[field.key] ?? ""}
              onChange={v => setForm(prev => ({ ...prev, [field.key]: v }))}
            />
          ))}
        </div>
      </Modal>

      {/* Delete confirmation */}
      <Modal
        title="Confirm Delete"
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        confirmLabel="Delete"
        confirmVariant="danger"
        loading={deleting}
      >
        <p className="text-sm text-[#8b949e]">
          Are you sure you want to delete{" "}
          <span className="font-semibold text-[#e6edf3]">
            {deleteTarget?.name || deleteTarget?.title || deleteTarget?.id?.slice(0, 12)}
          </span>?
          {" "}This action cannot be undone.
        </p>
      </Modal>
    </div>
  );
}


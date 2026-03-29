import { useState, useEffect, useCallback } from "react";
import { apiFetch, apiPost, apiPut, apiDelete } from "../api";
import { Modal } from "../components/Modal";
import { Badge } from "../components/Badge";

interface Collection {
  id: string;
  name: string;
  description?: string;
  fields: any[];
  rowCount: number;
  createdAt: number;
}

interface CollectionRow {
  id: string;
  data: Record<string, any>;
  createdByName?: string;
  createdAt: number;
}

// ── Collection Row expanded view ──────────────────────────────

function CollectionRows({ col, onRefresh }: { col: Collection; onRefresh: () => void }) {
  const [rows, setRows] = useState<CollectionRow[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CollectionRow | null>(null);
  const [jsonInput, setJsonInput] = useState("{}");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CollectionRow | null>(null);
  const [error, setError] = useState("");

  const loadRows = useCallback(() => {
    setLoading(true);
    apiFetch<CollectionRow[]>(`/collections/${col.id}/rows`)
      .then(setRows)
      .finally(() => setLoading(false));
  }, [col.id]);

  const toggle = () => {
    if (!open && rows.length === 0) loadRows();
    setOpen(v => !v);
  };

  const openCreate = () => {
    setEditTarget(null);
    setJsonInput("{}");
    setError("");
    setModalOpen(true);
  };

  const openEdit = (row: CollectionRow) => {
    setEditTarget(row);
    setJsonInput(JSON.stringify(row.data, null, 2));
    setError("");
    setModalOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const data = JSON.parse(jsonInput);
      if (editTarget) {
        await apiPut(`/collection-rows/${editTarget.id}`, { data });
      } else {
        await apiPost(`/collections/${col.id}/rows`, { data });
      }
      setModalOpen(false);
      loadRows();
      onRefresh();
    } catch (e: any) {
      setError(e.message?.includes("JSON") ? "Invalid JSON format" : e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await apiDelete(`/collection-rows/${deleteTarget.id}`);
    setDeleteTarget(null);
    loadRows();
    onRefresh();
  };

  const fieldKeys = col.fields?.map((f: any) => f.name || f.key || f).filter(Boolean) as string[];
  const displayKeys = fieldKeys.length > 0 ? fieldKeys.slice(0, 5) : (rows[0] ? Object.keys(rows[0].data).slice(0, 5) : []);

  return (
    <div className="bg-[#161b22] border border-[#21262d] rounded-xl overflow-hidden">
      {/* Header row */}
      <div className="flex items-center justify-between px-4 py-3 hover:bg-[#1c2128] transition-colors">
        <button onClick={toggle} className="flex-1 flex items-center gap-3 text-left">
          <span className={`text-[#8b949e] transition-transform text-xs ${open ? "rotate-90" : ""}`}>▶</span>
          <span className="font-medium text-[#e6edf3]">{col.name}</span>
          {col.description && <span className="text-xs text-[#8b949e] hidden md:inline">{col.description}</span>}
          <Badge variant="gray">{col.rowCount} rows</Badge>
        </button>
        <button
          onClick={openCreate}
          className="shrink-0 ml-3 flex items-center gap-1 px-2.5 py-1 text-xs bg-[#238636] hover:bg-[#2ea043] text-white rounded-md transition-colors"
        >
          + Row
        </button>
      </div>

      {/* Rows table */}
      {open && (
        <div className="border-t border-[#21262d]">
          {loading ? (
            <div className="py-8 text-center text-sm text-[#8b949e]">Loading rows…</div>
          ) : rows.length === 0 ? (
            <div className="py-8 text-center text-sm text-[#8b949e]">No rows yet</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#21262d] bg-[#0d1117]/50">
                    {displayKeys.map(k => (
                      <th key={k} className="px-4 py-2 text-left text-[10px] font-semibold text-[#8b949e] uppercase tracking-wider">{k}</th>
                    ))}
                    <th className="px-4 py-2 text-left text-[10px] font-semibold text-[#8b949e] uppercase tracking-wider">By</th>
                    <th className="px-4 py-2 text-left text-[10px] font-semibold text-[#8b949e] uppercase tracking-wider">Date</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#21262d]">
                  {rows.map(row => (
                    <tr key={row.id} className="hover:bg-[#1c2128] transition-colors group">
                      {displayKeys.map(k => (
                        <td key={k} className="px-4 py-2 text-[#e6edf3] max-w-[160px] truncate">
                          {typeof row.data[k] === "object" && row.data[k] !== null
                            ? <code className="text-[#79c0ff]">{JSON.stringify(row.data[k]).slice(0, 40)}</code>
                            : String(row.data[k] ?? "—")}
                        </td>
                      ))}
                      <td className="px-4 py-2 text-[#8b949e]">{row.createdByName ?? "—"}</td>
                      <td className="px-4 py-2 text-[#8b949e] whitespace-nowrap">{new Date(row.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => openEdit(row)}
                            className="px-2 py-0.5 text-[10px] text-[#8b949e] hover:text-[#e6edf3] border border-[#30363d] hover:border-[#8b949e] rounded transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setDeleteTarget(row)}
                            className="px-2 py-0.5 text-[10px] text-[#f85149] border border-[#f85149]/30 hover:bg-[#da3633] hover:text-white rounded transition-colors"
                          >
                            Del
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Row modal */}
      <Modal
        title={editTarget ? "Edit Row" : `Add Row to "${col.name}"`}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onConfirm={handleSave}
        loading={saving}
      >
        <div className="space-y-3">
          {error && <div className="bg-[#3d1a1a] border border-[#da3633]/50 text-[#f85149] text-xs rounded-lg px-3 py-2">{error}</div>}
          {fieldKeys.length > 0 && (
            <p className="text-xs text-[#8b949e]">Fields: <span className="text-[#79c0ff]">{fieldKeys.join(", ")}</span></p>
          )}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[#8b949e]">Row Data (JSON)</label>
            <textarea
              value={jsonInput}
              onChange={e => setJsonInput(e.target.value)}
              rows={8}
              className="w-full bg-[#0d1117] border border-[#30363d] text-[#e6edf3] text-xs rounded-lg px-3 py-2 font-mono focus:outline-none focus:border-[#388bfd] resize-y"
              placeholder='{}'
            />
          </div>
        </div>
      </Modal>

      <Modal
        title="Delete Row"
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        confirmLabel="Delete"
        confirmVariant="danger"
      >
        <p className="text-sm text-[#8b949e]">Remove this row permanently?</p>
      </Modal>
    </div>
  );
}

// ── Collections page ──────────────────────────────────────────

export function CollectionsPage({ botId }: { botId: string }) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [editTarget, setEditTarget] = useState<Collection | null>(null);
  const [form, setForm] = useState({ name: "", description: "", fields: "[]" });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Collection | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    if (!botId) return;
    setLoading(true);
    apiFetch<Collection[]>(`/bots/${botId}/collections`)
      .then(setCollections)
      .finally(() => setLoading(false));
  }, [botId]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setForm({ name: "", description: "", fields: "[]" });
    setEditTarget(null);
    setError("");
    setModalMode("create");
  };

  const openEdit = (col: Collection) => {
    setForm({ name: col.name, description: col.description ?? "", fields: JSON.stringify(col.fields, null, 2) });
    setEditTarget(col);
    setError("");
    setModalMode("edit");
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      let fields: any[];
      try { fields = JSON.parse(form.fields); } catch { throw new Error("Fields must be valid JSON"); }
      if (modalMode === "create") {
        await apiPost(`/bots/${botId}/collections`, { name: form.name, description: form.description, fields });
      } else if (editTarget) {
        await apiPut(`/collections/${editTarget.id}`, { name: form.name, description: form.description, fields });
      }
      setModalMode(null);
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await apiDelete(`/collections/${deleteTarget.id}`);
    setDeleteTarget(null);
    load();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[#e6edf3] flex items-center gap-2">⊞ Collections</h2>
          <p className="text-sm text-[#8b949e] mt-0.5">Dynamic data tables created and managed by the bot</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 bg-[#238636] hover:bg-[#2ea043] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + New Collection
        </button>
      </div>

      {loading ? (
        <div className="py-16 text-center text-[#8b949e] text-sm">Loading…</div>
      ) : collections.length === 0 ? (
        <div className="bg-[#161b22] border border-[#21262d] rounded-xl py-16 text-center">
          <div className="text-3xl mb-3 opacity-30">⊞</div>
          <p className="text-[#8b949e] text-sm">No collections yet</p>
          <button onClick={openCreate} className="mt-3 text-xs text-[#388bfd] hover:underline">
            Create the first one →
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {collections.map(col => (
            <div key={col.id} className="relative">
              <CollectionRows col={col} onRefresh={load} />
              <div className="absolute top-2.5 right-20 flex gap-1.5 z-10">
                <button
                  onClick={() => openEdit(col)}
                  className="px-2 py-1 text-xs text-[#8b949e] hover:text-[#e6edf3] border border-[#30363d] hover:border-[#8b949e] rounded transition-colors bg-[#161b22]"
                >
                  Edit
                </button>
                <button
                  onClick={() => setDeleteTarget(col)}
                  className="px-2 py-1 text-xs text-[#f85149] border border-[#f85149]/30 hover:bg-[#da3633] hover:text-white rounded transition-colors bg-[#161b22]"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        title={modalMode === "create" ? "New Collection" : "Edit Collection"}
        open={modalMode !== null}
        onClose={() => setModalMode(null)}
        onConfirm={handleSave}
        loading={saving}
      >
        <div className="space-y-4">
          {error && <div className="bg-[#3d1a1a] border border-[#da3633]/50 text-[#f85149] text-xs rounded-lg px-3 py-2">{error}</div>}
          {[
            { key: "name", label: "Name", type: "text", placeholder: "e.g. Orders" },
            { key: "description", label: "Description", type: "text", placeholder: "Optional description" },
          ].map(f => (
            <div key={f.key} className="space-y-1.5">
              <label className="block text-xs font-medium text-[#8b949e]">{f.label}</label>
              <input
                type="text"
                value={(form as any)[f.key]}
                onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                className="w-full bg-[#0d1117] border border-[#30363d] text-[#e6edf3] text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-[#388bfd] placeholder-[#8b949e]/60"
              />
            </div>
          ))}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[#8b949e]">
              Fields Schema (JSON)
              <span className="ml-1 font-normal text-[#8b949e]/60">e.g. [&#123;"name":"title","type":"text"&#125;]</span>
            </label>
            <textarea
              value={form.fields}
              onChange={e => setForm(p => ({ ...p, fields: e.target.value }))}
              rows={5}
              className="w-full bg-[#0d1117] border border-[#30363d] text-[#e6edf3] text-xs rounded-lg px-3 py-2 font-mono focus:outline-none focus:border-[#388bfd] resize-y"
            />
          </div>
        </div>
      </Modal>

      <Modal
        title="Delete Collection"
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        confirmLabel="Delete"
        confirmVariant="danger"
      >
        <p className="text-sm text-[#8b949e]">
          Delete collection <span className="font-semibold text-[#e6edf3]">"{deleteTarget?.name}"</span> and all its rows? This cannot be undone.
        </p>
      </Modal>
    </div>
  );
}

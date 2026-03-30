import { useState, useEffect, useCallback } from "react";
import { apiFetch, apiDelete } from "../api";
import { Modal } from "../components/Modal";
import { Badge, statusVariant } from "../components/Badge";

export interface ReadColDef {
  key: string;
  label: string;
  render?: (val: any, row: any) => React.ReactNode;
}

interface ReadPageProps {
  title: string;
  icon: string;
  description?: string;
  endpoint: string;
  columns: ReadColDef[];
  deleteEndpoint?: (id: string) => string;
}

export function ReadPage({ title, icon, description, endpoint, columns, deleteEndpoint }: ReadPageProps) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<any>(null);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch(endpoint)
      .then(rows => setData(Array.isArray(rows) ? rows : []))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [endpoint]);

  useEffect(() => { load(); }, [load]);

  const filtered = search
    ? data.filter(row =>
        JSON.stringify(row).toLowerCase().includes(search.toLowerCase())
      )
    : data;

  const handleDelete = async () => {
    if (!deleteTarget || !deleteEndpoint) return;
    setDeleting(true);
    try {
      await apiDelete(deleteEndpoint(deleteTarget.id));
      setDeleteTarget(null);
      load();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[#e6edf3] flex items-center gap-2">
            <span>{icon}</span>{title}
          </h2>
          {description && <p className="text-sm text-[#8b949e] mt-0.5">{description}</p>}
        </div>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search…"
          className="bg-[#21262d] border border-[#30363d] text-[#e6edf3] text-sm rounded-lg px-3 py-1.5 w-52 focus:outline-none focus:border-[#388bfd] placeholder-[#8b949e]/60"
        />
      </div>

      <div className="bg-[#161b22] border border-[#21262d] rounded-xl overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-[#8b949e] text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <div className="text-3xl mb-3 opacity-30">{icon}</div>
            <p className="text-[#8b949e] text-sm">{search ? "No results matching your search" : `No ${title.toLowerCase()} yet`}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#21262d]">
                  {columns.map(col => (
                    <th key={col.key} className="px-4 py-3 text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider whitespace-nowrap">
                      {col.label}
                    </th>
                  ))}
                  {deleteEndpoint && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#21262d]">
                {filtered.map((row, i) => (
                  <tr key={row.id ?? i} className="hover:bg-[#1c2128] transition-colors group cursor-pointer" onClick={() => setDetail(row)}>
                    {columns.map(col => (
                      <td key={col.key} className="px-4 py-3 text-[#e6edf3]">
                        {col.render
                          ? col.render(row[col.key], row)
                          : typeof row[col.key] === "object" && row[col.key] !== null
                            ? <code className="text-xs text-[#79c0ff] bg-[#0d1117] px-2 py-0.5 rounded font-mono">
                                {JSON.stringify(row[col.key]).slice(0, 60)}{JSON.stringify(row[col.key]).length > 60 ? "…" : ""}
                              </code>
                            : <span className="truncate block max-w-[240px]">{String(row[col.key] ?? "—")}</span>
                        }
                      </td>
                    ))}
                    {deleteEndpoint && (
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setDeleteTarget(row)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity px-2.5 py-1 text-xs text-[#f85149] border border-[#f85149]/30 hover:bg-[#da3633] hover:text-white hover:border-[#da3633] rounded-md"
                        >
                          Delete
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-2.5 border-t border-[#21262d] text-xs text-[#8b949e]">
              {filtered.length} of {data.length} record{data.length !== 1 ? "s" : ""}
            </div>
          </div>
        )}
      </div>

      {/* Detail Panel */}
      {detail && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setDetail(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative w-full max-w-lg bg-[#161b22] border-l border-[#21262d] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-[#161b22] border-b border-[#21262d] px-5 py-4 flex items-center justify-between z-10">
              <h3 className="text-sm font-semibold text-[#e6edf3]">{icon} Detail</h3>
              <button onClick={() => setDetail(null)} className="text-[#8b949e] hover:text-[#e6edf3] text-lg">✕</button>
            </div>
            <div className="p-5 space-y-4">
              {Object.entries(detail).map(([key, value]) => (
                <div key={key} className="border-b border-[#21262d] pb-3">
                  <div className="text-xs font-semibold text-[#8b949e] uppercase tracking-wider mb-1">{key}</div>
                  {typeof value === "object" && value !== null ? (
                    <pre className="text-xs text-[#79c0ff] bg-[#0d1117] rounded-lg p-3 overflow-x-auto font-mono whitespace-pre-wrap">
                      {JSON.stringify(value, null, 2)}
                    </pre>
                  ) : (
                    <div className="text-sm text-[#e6edf3] whitespace-pre-wrap break-words">
                      {String(value ?? "—")}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {deleteEndpoint && (
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
      )}
    </div>
  );
}

// ── Pre-built read pages ──────────────────────────────────────

export function UsersPage({ botId }: { botId: string }) {
  return (
    <ReadPage
      title="Users"
      icon="⊙"
      description="Telegram and channel users interacting with this bot"
      endpoint={`/bots/${botId}/users`}
      columns={[
        { key: "displayName", label: "Name",     render: (v) => <span className="font-medium text-[#e6edf3]">{v ?? "—"}</span> },
        { key: "channel",     label: "Channel",  render: (v) => <Badge variant="blue">{v}</Badge> },
        { key: "channelUserId", label: "Channel ID", render: (v) => <span className="font-mono text-xs text-[#8b949e]">{v}</span> },
        { key: "role",        label: "Role",     render: (v) => <Badge variant={v === "admin" ? "yellow" : "gray"}>{v}</Badge> },
        { key: "isActive",    label: "Active",   render: (v) => <Badge variant={v ? "green" : "red"}>{v ? "Yes" : "No"}</Badge> },
        { key: "createdAt",   label: "Joined",   render: (v) => v ? <span className="text-[#8b949e] text-xs">{new Date(v).toLocaleDateString()}</span> : "—" },
      ]}
    />
  );
}

export function FilesPage({ botId }: { botId: string }) {
  return (
    <ReadPage
      title="Files"
      icon="◧"
      description="Uploaded files and documents"
      endpoint={`/bots/${botId}/files`}
      columns={[
        { key: "name",       label: "Name",     render: (v) => <span className="font-medium text-[#e6edf3]">{v}</span> },
        { key: "mimeType",   label: "Type",     render: (v) => <span className="text-xs text-[#8b949e] font-mono">{v ?? "—"}</span> },
        { key: "size",       label: "Size",     render: (v) => v ? <span className="text-[#8b949e] text-xs">{(v / 1024).toFixed(1)} KB</span> : "—" },
        { key: "status",     label: "Status",   render: (v) => v ? <Badge variant={statusVariant(v)}>{v}</Badge> : "—" },
        { key: "createdAt",  label: "Uploaded", render: (v) => v ? <span className="text-[#8b949e] text-xs">{new Date(v).toLocaleDateString()}</span> : "—" },
      ]}
    />
  );
}

export function KnowledgePage({ botId }: { botId: string }) {
  return (
    <ReadPage
      title="Knowledge"
      icon="◬"
      description="Knowledge entries learned by the bot"
      endpoint={`/bots/${botId}/knowledge`}
      deleteEndpoint={(id) => `/knowledge/${id}`}
      columns={[
        { key: "title",     label: "Title",      render: (v) => <span className="font-medium text-[#e6edf3]">{v}</span> },
        { key: "type",      label: "Type",       render: (v) => <Badge variant="purple">{v}</Badge> },
        { key: "domain",    label: "Domain",     render: (v) => v ? <Badge variant="blue">{v}</Badge> : "—" },
        { key: "usageCount", label: "Used",      render: (v) => <span className="text-[#e3b341] font-mono text-xs">{v}×</span> },
        { key: "relevanceScore", label: "Score", render: (v) => <span className="text-[#79c0ff] text-xs">{Number(v).toFixed(2)}</span> },
        { key: "scope",     label: "Scope",      render: (v) => <span className="text-[#8b949e] text-xs">{v}</span> },
      ]}
    />
  );
}

export function SessionsPage({ botId }: { botId: string }) {
  return (
    <ReadPage
      title="Sessions"
      icon="◎"
      description="Active and recent conversation sessions"
      endpoint={`/bots/${botId}/sessions`}
      columns={[
        { key: "userName",      label: "User",    render: (v) => <span className="font-medium text-[#e6edf3]">{v ?? "Unknown"}</span> },
        { key: "channelUserId", label: "Channel ID", render: (v) => <span className="font-mono text-xs text-[#8b949e]">{v}</span> },
        { key: "messageCount",  label: "Messages", render: (v) => <span className="text-[#79c0ff] font-mono text-xs">{v}</span> },
        { key: "stateSize",     label: "State",   render: (v) => <span className="text-[#8b949e] text-xs">{v ? `${(v / 1024).toFixed(1)} KB` : "—"}</span> },
        { key: "createdAt",     label: "Started", render: (v) => v ? <span className="text-[#8b949e] text-xs">{new Date(v).toLocaleString()}</span> : "—" },
      ]}
    />
  );
}

export function CronsPage({ botId }: { botId: string }) {
  return (
    <ReadPage
      title="Crons"
      icon="◷"
      description="Scheduled tasks and recurring jobs"
      endpoint={`/bots/${botId}/crons`}
      deleteEndpoint={(id) => `/crons/${id}`}
      columns={[
        { key: "name",       label: "Name",     render: (v) => <span className="font-medium text-[#e6edf3]">{v ?? "—"}</span> },
        { key: "schedule",   label: "Schedule", render: (v) => v ? <code className="text-xs text-[#e3b341] bg-[#0d1117] px-2 py-0.5 rounded font-mono">{v}</code> : "—" },
        { key: "status",     label: "Status",   render: (v) => v ? <Badge variant={statusVariant(v)}>{v}</Badge> : "—" },
        { key: "last_run_at", label: "Last Run",render: (v) => v ? <span className="text-[#8b949e] text-xs">{new Date(v).toLocaleString()}</span> : "—" },
        { key: "next_run_at", label: "Next Run",render: (v) => v ? <span className="text-[#79c0ff] text-xs">{new Date(v).toLocaleString()}</span> : "—" },
      ]}
    />
  );
}

import { useEffect, useState } from "react";

const API = import.meta.env.VITE_API_URL || "http://192.168.1.183:3102/api";

interface Bot { id: string; name: string; botStatus: string; botUsername: string; botName: string; thinking: boolean }
interface Overview { bots: { id: string; name: string; botStatus: string }[]; users: number; collections: number; rows: number; files: number; knowledge: number; sessions: number }

function App() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [bots, setBots] = useState<Bot[]>([]);
  const [bot, setBot] = useState("");
  const [tab, setTab] = useState("collections");
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`${API}/overview`).then(r => r.json()).then(setOverview).catch(() => {});
    fetch(`${API}/bots`).then(r => r.json()).then(setBots).catch(() => {});
  }, []);

  useEffect(() => {
    if (!bot) return;
    setLoading(true);
    fetch(`${API}/bots/${bot}/${tab}`).then(r => r.json()).then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, [bot, tab]);

  const tabs = ["collections", "users", "files", "knowledge", "sessions", "forms", "workflows", "rules", "agents", "crons"];
  const icons: Record<string, string> = { collections: "📋", users: "👥", files: "📁", knowledge: "🧠", sessions: "💬", forms: "📝", workflows: "⚙️", rules: "📏", agents: "🤖", crons: "⏰" };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 font-sans">
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <h1 className="text-xl font-bold">🦀 OpenClaw</h1>
          <span className="text-sm text-gray-500">{overview?.bots.length ?? 0} bots active</span>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {overview && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            {[
              { l: "Bots", v: overview.bots.length, i: "🤖" },
              { l: "Users", v: overview.users, i: "👥" },
              { l: "Collections", v: overview.collections, i: "📋" },
              { l: "Rows", v: overview.rows, i: "📊" },
              { l: "Files", v: overview.files, i: "📁" },
              { l: "Knowledge", v: overview.knowledge, i: "🧠" },
              { l: "Sessions", v: overview.sessions, i: "💬" },
            ].map(c => (
              <div key={c.l} className="bg-gray-900 rounded-xl p-4 border border-gray-800 hover:border-gray-700 transition">
                <div className="text-2xl">{c.i}</div>
                <div className="text-2xl font-bold mt-1">{c.v}</div>
                <div className="text-xs text-gray-500">{c.l}</div>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-3 flex-wrap">
          {bots.map(b => (
            <button key={b.id} onClick={() => setBot(b.id)}
              className={`px-4 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                bot === b.id ? "bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/20" : "bg-gray-900 border-gray-800 text-gray-400 hover:border-gray-600 hover:text-gray-200"
              }`}>
              <span className={`inline-block w-2 h-2 rounded-full mr-2 ${b.botStatus === "active" ? "bg-emerald-400" : "bg-red-400"}`} />
              {b.botName}{b.thinking && <span className="ml-1.5 text-yellow-400">💭</span>}
            </button>
          ))}
        </div>

        {bot && (
          <div className="flex gap-1 bg-gray-900/50 rounded-xl p-1.5 flex-wrap border border-gray-800">
            {tabs.map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                  tab === t ? "bg-gray-800 text-white shadow" : "text-gray-500 hover:text-gray-300"
                }`}>
                {icons[t]} {t}
              </button>
            ))}
          </div>
        )}

        {bot && (
          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            {loading ? (
              <div className="p-12 text-center text-gray-600">
                <div className="animate-spin text-3xl mb-2">⏳</div>Loading...
              </div>
            ) : data.length === 0 ? (
              <div className="p-12 text-center text-gray-600">No data</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="bg-gray-800/80">
                    {Object.keys(data[0]).slice(0, 8).map(k => (
                      <th key={k} className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">{k}</th>
                    ))}
                  </tr></thead>
                  <tbody className="divide-y divide-gray-800/50">
                    {data.map((row, i) => (
                      <tr key={i} className="hover:bg-gray-800/30 transition">
                        {Object.values(row).slice(0, 8).map((v, j) => (
                          <td key={j} className="px-4 py-3 max-w-xs truncate">
                            {typeof v === "object" && v !== null ? (
                              <code className="text-xs text-emerald-400/70 bg-gray-800 px-2 py-0.5 rounded font-mono">
                                {JSON.stringify(v).substring(0, 80)}
                              </code>
                            ) : (<span className="text-gray-300">{String(v ?? "—")}</span>)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="px-4 py-2 bg-gray-800/30 text-xs text-gray-600 border-t border-gray-800">{data.length} rows</div>
          </div>
        )}

        {/* Live Logs */}
        <LiveLogs />

        {bot && tab === "collections" && data.length > 0 && (
          <div className="space-y-3">
            {data.map((col: any) => <CollectionRows key={col.id} col={col} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function CollectionRows({ col }: { col: any }) {
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);

  const toggle = () => {
    if (!open && rows.length === 0) {
      fetch(`${API}/collections/${col.id}/rows`).then(r => r.json()).then(setRows);
    }
    setOpen(!open);
  };

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      <button onClick={toggle} className="w-full px-5 py-3.5 flex items-center justify-between hover:bg-gray-800/40 transition">
        <span className="font-semibold">{col.name}</span>
        <span className="text-sm text-gray-500">{col.rowCount} rows {open ? "▲" : "▼"}</span>
      </button>
      {open && rows.length > 0 && (
        <div className="border-t border-gray-800">
          {rows.map((r: any) => (
            <div key={r.id} className="px-5 py-3 border-b border-gray-800/50 hover:bg-gray-800/20">
              <div className="flex items-center gap-3 mb-1">
                <span className="text-xs font-mono text-gray-600">{r.id?.substring(0, 10)}</span>
                {(r.createdByName || r.createdBy) && (
                  <span className="text-xs bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full">
                    👤 {r.createdByName || r.createdBy}
                  </span>
                )}
              </div>
              <pre className="text-xs text-gray-400 whitespace-pre-wrap leading-relaxed">
                {JSON.stringify(r.data, null, 2).substring(0, 400)}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LiveLogs() {
  const [logs, setLogs] = useState<{ type: string; content: string; tenant_name?: string; user_name?: string; created_at: number; metadata?: any }[]>([]);
  const [connected, setConnected] = useState(false);
  const [filter, setFilter] = useState("all");
  const logsEndRef = { current: null as HTMLDivElement | null };

  // Load persistent logs from DB on mount
  useEffect(() => {
    fetch(`${API}/logs?limit=100`).then(r => r.json()).then((rows: any[]) => {
      const sorted = rows.sort((a: any, b: any) => a.created_at - b.created_at);
      setLogs(sorted);
    }).catch(() => {});
  }, []);

  // Live stream via WebSocket
  useEffect(() => {
    const wsUrl = API.replace("http", "ws").replace("/api", "") + "/ws/logs";
    let ws: WebSocket;
    const connect = () => {
      ws = new WebSocket(wsUrl);
      ws.onopen = () => setConnected(true);
      ws.onclose = () => { setConnected(false); setTimeout(connect, 3000); };
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === "log") {
          // System log — show in raw format
          setLogs(prev => [...prev.slice(-300), { type: "system", content: msg.text, created_at: msg.ts }]);
        }
      };
    };
    connect();
    return () => ws?.close();
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const typeStyles: Record<string, { icon: string; color: string }> = {
    user_message: { icon: "👤", color: "text-blue-300" },
    bot_response: { icon: "🤖", color: "text-emerald-300" },
    thinking: { icon: "💭", color: "text-purple-300" },
    tool_call: { icon: "🔧", color: "text-yellow-300" },
    tool_result: { icon: "📦", color: "text-orange-300" },
    knowledge_match: { icon: "🧠", color: "text-cyan-300" },
    persona: { icon: "🎭", color: "text-pink-300" },
    error: { icon: "❌", color: "text-red-400" },
    system: { icon: "⚙️", color: "text-gray-500" },
  };

  const filtered = filter === "all" ? logs : logs.filter(l => l.type === filter);
  const types = ["all", "user_message", "bot_response", "tool_call", "system", "error"];

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      <div className="px-4 py-3 bg-gray-800/50 flex items-center justify-between border-b border-gray-800">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${connected ? "bg-green-400 animate-pulse" : "bg-red-400"}`} />
          <span className="text-sm font-semibold">Bot Activity Log</span>
        </div>
        <div className="flex gap-2 items-center">
          {types.map(t => (
            <button key={t} onClick={() => setFilter(t)}
              className={`text-xs px-2 py-0.5 rounded ${filter === t ? "bg-gray-700 text-white" : "text-gray-500 hover:text-gray-300"}`}>
              {t === "all" ? "All" : (typeStyles[t]?.icon ?? "") + " " + t.replace("_", " ")}
            </button>
          ))}
          <span className="text-xs text-gray-600">|</span>
          <span className="text-xs text-gray-500">{filtered.length}</span>
        </div>
      </div>
      <div className="h-[500px] overflow-y-auto p-3 text-sm space-y-1 bg-gray-950">
        {filtered.length === 0 && <div className="text-gray-600 text-center py-8">No logs yet — nhắn bot để thấy logs</div>}
        {filtered.map((log, i) => {
          const style = typeStyles[log.type] ?? { icon: "📝", color: "text-gray-400" };
          const time = new Date(log.created_at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
          return (
            <div key={i} className={`${style.color} py-1 ${log.type === "bot_response" ? "bg-gray-900/50 px-3 rounded-lg border-l-2 border-emerald-800 ml-4" : ""} ${log.type === "user_message" ? "border-l-2 border-blue-800 pl-3" : ""}`}>
              <div className="flex items-start gap-2">
                <span className="text-gray-600 font-mono text-xs shrink-0 mt-0.5">{time}</span>
                <span className="shrink-0">{style.icon}</span>
                <div className="flex-1 min-w-0">
                  {log.tenant_name && <span className="text-xs text-gray-600 mr-1">[{log.tenant_name}]</span>}
                  {log.user_name && log.type === "user_message" && <span className="font-semibold mr-1">{log.user_name}:</span>}
                  <span className={`${log.type === "bot_response" ? "whitespace-pre-wrap" : ""}`}>
                    {log.content.substring(0, 500)}
                    {log.content.length > 500 && <span className="text-gray-600">...</span>}
                  </span>
                  {log.metadata?.elapsed && <span className="text-xs text-gray-600 ml-2">({log.metadata.elapsed}ms)</span>}
                  {log.metadata?.tool && <span className="text-xs bg-yellow-500/10 text-yellow-400 px-1.5 rounded ml-2">{log.metadata.tool}</span>}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={(el) => { logsEndRef.current = el; }} />
      </div>
    </div>
  );
}

export default App;

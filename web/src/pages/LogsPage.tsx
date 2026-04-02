import { useEffect, useRef, useState } from "react";
import { API } from "../api";

interface LogEntry {
  type: string;
  content: string;
  tenant_name?: string;
  user_name?: string;
  created_at: number;
  metadata?: Record<string, any>;
}

const TYPE_STYLES: Record<string, { icon: string; color: string; bg?: string; border?: string }> = {
  user_message:    { icon: "👤", color: "text-[#79c0ff]",  border: "border-l-2 border-[#388bfd] pl-3" },
  bot_response:    { icon: "🤖", color: "text-[#56d364]",  bg: "bg-[#0d1117]", border: "border-l-2 border-[#238636] pl-3 ml-4" },
  thinking:        { icon: "💭", color: "text-[#bc8cff]" },
  tool_call:       { icon: "🔧", color: "text-[#e3b341]" },
  tool_result:     { icon: "📦", color: "text-[#f78166]" },
  knowledge_match: { icon: "🧠", color: "text-[#79c0ff]" },
  persona:         { icon: "🎭", color: "text-[#f778ba]" },
  error:           { icon: "✕",  color: "text-[#f85149]",  bg: "bg-[#3d1a1a]" },
  system:          { icon: "⚙",  color: "text-[#8b949e]/70" },
};

const FILTER_TYPES = [
  { key: "all",          label: "All" },
  { key: "user_message", label: "Users" },
  { key: "bot_response", label: "Bot" },
  { key: "tool_call",    label: "Tools" },
  { key: "error",        label: "Errors" },
  { key: "system",       label: "System" },
];

export function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [filter, setFilter] = useState("all");
  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load historical logs
  useEffect(() => {
    fetch(`${API}/logs?limit=200`)
      .then(r => r.json())
      .then((rows: any[]) => {
        const sorted = [...rows].sort((a, b) => a.created_at - b.created_at);
        setLogs(sorted);
      })
      .catch(() => {});
  }, []);

  // WebSocket live stream
  useEffect(() => {
    const wsUrl = API.replace("http", "ws").replace("/api", "") + "/ws/logs";
    let ws: WebSocket;
    const connect = () => {
      ws = new WebSocket(wsUrl);
      ws.onopen = () => setConnected(true);
      ws.onclose = () => { setConnected(false); setTimeout(connect, 3000); };
      ws.onerror = () => ws.close();
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "log") {
            setLogs(prev => [...prev.slice(-400), {
              type: "system", content: msg.text, created_at: msg.ts,
            }]);
          } else if (msg.type === "connected") {
            // ignore
          } else {
            setLogs(prev => [...prev.slice(-400), msg]);
          }
        } catch {}
      };
    };
    connect();
    return () => ws?.close();
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, autoScroll]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 80);
  };

  const filtered = filter === "all" ? logs : logs.filter(l => l.type === filter);

  const fmt = (ts: number) =>
    new Date(ts).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[#e6edf3] flex items-center gap-2">◉ Live Logs</h2>
          <p className="text-sm text-[#8b949e] mt-0.5">Real-time bot activity stream</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`flex items-center gap-1.5 text-xs ${connected ? "text-[#3fb950]" : "text-[#f85149]"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-[#3fb950] animate-pulse" : "bg-[#f85149]"}`} />
            {connected ? "Live" : "Reconnecting…"}
          </span>
          <button
            onClick={() => setLogs([])}
            className="px-2.5 py-1 text-xs text-[#8b949e] hover:text-[#e6edf3] border border-[#30363d] hover:border-[#8b949e] rounded-md transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex gap-1.5 flex-wrap">
        {FILTER_TYPES.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1 text-xs rounded-full border transition-colors ${
              filter === f.key
                ? "bg-[#388bfd] border-[#388bfd] text-white"
                : "border-[#30363d] text-[#8b949e] hover:text-[#e6edf3] hover:border-[#8b949e]"
            }`}
          >
            {f.label}
            <span className="ml-1 opacity-60">
              {f.key === "all" ? logs.length : logs.filter(l => l.type === f.key).length}
            </span>
          </button>
        ))}
      </div>

      {/* Log container */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 bg-[#0d1117] rounded-xl border border-[#21262d] overflow-y-auto p-4 space-y-1 font-mono text-xs"
        style={{ height: "calc(100vh - 260px)" }}
      >
        {filtered.length === 0 && (
          <div className="flex items-center justify-center h-32 text-[#8b949e]">
            No logs{filter !== "all" ? ` for "${filter}"` : ""} yet
          </div>
        )}
        {filtered.map((log, i) => {
          const style = TYPE_STYLES[log.type] ?? TYPE_STYLES.system;
          return (
            <div
              key={i}
              className={`flex items-start gap-2 py-0.5 rounded px-1 ${style.bg ?? ""} ${style.border ?? ""} ${style.color}`}
            >
              <span className="text-[#8b949e] shrink-0 tabular-nums w-20">{fmt(log.created_at)}</span>
              <span className="shrink-0">{style.icon}</span>
              <div className="flex-1 min-w-0 leading-relaxed">
                {log.tenant_name && <span className="text-[#8b949e]/60">[{log.tenant_name}] </span>}
                {log.user_name && log.type === "user_message" && (
                  <span className="font-bold">{log.user_name}: </span>
                )}
                <span className={log.type === "bot_response" ? "whitespace-pre-wrap" : ""}>
                  {log.content.slice(0, 600)}
                  {log.content.length > 600 && <span className="text-[#8b949e]/60">… ({log.content.length} chars)</span>}
                </span>
                {log.metadata?.elapsed && <span className="text-[#8b949e]/60 ml-2">({log.metadata.elapsed}ms)</span>}
                {log.metadata?.tool && <span className="ml-2 text-[#e3b341] bg-[#3d2e0a] px-1.5 rounded">{log.metadata.tool}</span>}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {!autoScroll && (
        <button
          onClick={() => { setAutoScroll(true); bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }}
          className="fixed bottom-6 right-6 bg-[#388bfd] hover:bg-[#58a6ff] text-white text-xs px-3 py-1.5 rounded-full shadow-lg transition-colors"
        >
          ↓ Scroll to bottom
        </button>
      )}
    </div>
  );
}

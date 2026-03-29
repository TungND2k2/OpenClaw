import { useEffect, useState } from "react";
import type { Overview } from "../types";
import { apiFetch } from "../api";
import { Badge, statusVariant } from "../components/Badge";

interface StatCardProps {
  icon: string;
  label: string;
  value: number | string;
  sub?: string;
  color?: string;
}

function StatCard({ icon, label, value, sub, color = "text-[#388bfd]" }: StatCardProps) {
  return (
    <div className="bg-[#161b22] border border-[#21262d] rounded-xl p-5 hover:border-[#30363d] transition-colors">
      <div className={`text-2xl mb-3 ${color}`}>{icon}</div>
      <div className="text-2xl font-bold text-[#e6edf3] tabular-nums">{value}</div>
      <div className="text-xs text-[#8b949e] mt-1">{label}</div>
      {sub && <div className="text-xs text-[#8b949e]/60 mt-0.5">{sub}</div>}
    </div>
  );
}

export function DashboardPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiFetch<Overview>("/overview")
      .then(setOverview)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="text-[#8b949e] text-sm">Loading overview…</div>
      </div>
    );
  }

  if (!overview) return null;

  const stats = [
    { icon: "🤖", label: "Bots",        value: overview.bots.length,   color: "text-[#bc8cff]" },
    { icon: "👥", label: "Users",       value: overview.users,         color: "text-[#388bfd]" },
    { icon: "⊞",  label: "Collections", value: overview.collections,   color: "text-[#3fb950]" },
    { icon: "📊", label: "Rows",        value: overview.rows,          color: "text-[#e3b341]" },
    { icon: "📁", label: "Files",       value: overview.files,         color: "text-[#f78166]" },
    { icon: "🧠", label: "Knowledge",   value: overview.knowledge,     color: "text-[#79c0ff]" },
    { icon: "💬", label: "Sessions",    value: overview.sessions,      color: "text-[#56d364]" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-[#e6edf3] mb-1">Overview</h2>
        <p className="text-sm text-[#8b949e]">System-wide statistics across all bots</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-4">
        {stats.map(s => <StatCard key={s.label} {...s} />)}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-[#e6edf3] mb-3">Bots</h3>
        <div className="bg-[#161b22] border border-[#21262d] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#21262d]">
                <th className="px-4 py-3 text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider">Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider">ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#21262d]">
              {overview.bots.map(bot => (
                <tr key={bot.id} className="hover:bg-[#1c2128] transition-colors">
                  <td className="px-4 py-3 text-[#e6edf3] font-medium">{bot.name}</td>
                  <td className="px-4 py-3">
                    <Badge variant={statusVariant(bot.botStatus)}>{bot.botStatus}</Badge>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-[#8b949e]">{bot.id.slice(0, 16)}…</td>
                </tr>
              ))}
              {overview.bots.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-[#8b949e] text-sm">No bots configured</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export type BadgeVariant = "green" | "red" | "yellow" | "blue" | "gray" | "purple";

const variants: Record<BadgeVariant, string> = {
  green:  "bg-[#1a4731] text-[#3fb950] border border-[#238636]/40",
  red:    "bg-[#3d1a1a] text-[#f85149] border border-[#da3633]/40",
  yellow: "bg-[#3d2e0a] text-[#e3b341] border border-[#e3b341]/40",
  blue:   "bg-[#0c2d5c] text-[#58a6ff] border border-[#388bfd]/40",
  gray:   "bg-[#21262d] text-[#8b949e] border border-[#30363d]",
  purple: "bg-[#2d1a4d] text-[#bc8cff] border border-[#8957e5]/40",
};

export function Badge({ children, variant = "gray" }: { children: React.ReactNode; variant?: BadgeVariant }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${variants[variant]}`}>
      {children}
    </span>
  );
}

export function statusVariant(status: string): BadgeVariant {
  const s = String(status).toLowerCase();
  if (["active", "online", "running", "success", "done", "completed"].includes(s)) return "green";
  if (["error", "failed", "stopped", "inactive", "dead"].includes(s)) return "red";
  if (["pending", "waiting", "draft", "paused"].includes(s)) return "yellow";
  if (["processing", "busy", "thinking"].includes(s)) return "blue";
  return "gray";
}

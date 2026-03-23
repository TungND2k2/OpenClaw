/**
 * SSH Service — execute commands on remote VMs via bot.
 *
 * 3 tiers:
 * - AUTO: safe read-only commands → execute immediately
 * - CONFIRM: impactful commands → ask user first
 * - BLOCKED: dangerous commands → reject
 */

import { getDb } from "../../db/connection.js";
import { newId } from "../../utils/id.js";
import { nowMs } from "../../utils/clock.js";

// ── Command Classification ──────────────────────────────

const AUTO_PATTERNS = [
  /^docker\s+ps/i,
  /^docker\s+logs/i,
  /^docker\s+inspect/i,
  /^docker\s+images/i,
  /^git\s+status/i,
  /^git\s+log/i,
  /^git\s+branch/i,
  /^git\s+diff/i,
  /^ls\b/i,
  /^cat\b/i,
  /^head\b/i,
  /^tail\b/i,
  /^df\b/i,
  /^free\b/i,
  /^uptime/i,
  /^whoami/i,
  /^hostname/i,
  /^uname/i,
  /^pwd/i,
  /^pm2\s+(list|status|logs|show)/i,
  /^systemctl\s+status/i,
  /^curl\s.*localhost/i,
  /^ping\b/i,
  /^top\s+-bn1/i,
  /^htop/i,
  /^netstat/i,
  /^ss\s/i,
];

const BLOCKED_PATTERNS = [
  /rm\s+-rf\s+\//i,
  /rm\s+-rf\s+\/\*/i,
  /mkfs/i,
  /dd\s+if=/i,
  /chmod\s+777\s+\//i,
  /drop\s+database/i,
  /drop\s+table/i,
  /truncate\s+table/i,
  />\s*\/dev\/sd/i,
  /shutdown/i,
  /reboot/i,
  /init\s+0/i,
  /passwd/i,
  /userdel/i,
  /:(){ :|:& };:/,  // fork bomb
];

export type CommandTier = "auto" | "confirm" | "blocked";

export function classifyCommand(command: string): CommandTier {
  const cmd = command.trim();

  // Check blocked first
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(cmd)) return "blocked";
  }

  // Check auto-approve
  for (const pattern of AUTO_PATTERNS) {
    if (pattern.test(cmd)) return "auto";
  }

  // Everything else needs confirmation
  return "confirm";
}

// ── Pending Confirmations ───────────────────────────────

interface PendingExec {
  id: string;
  host: string;
  port: number;
  user: string;
  command: string;
  requestedBy: string;
  requestedAt: number;
  expiresAt: number;
}

const _pendingExecs = new Map<string, PendingExec>();

export function createPendingExec(input: {
  host: string;
  port: number;
  user: string;
  command: string;
  requestedBy: string;
}): PendingExec {
  const id = newId().substring(0, 8);
  const pending: PendingExec = {
    id,
    host: input.host,
    port: input.port,
    user: input.user,
    command: input.command,
    requestedBy: input.requestedBy,
    requestedAt: nowMs(),
    expiresAt: nowMs() + 5 * 60 * 1000, // 5 min expiry
  };
  _pendingExecs.set(id, pending);
  return pending;
}

export function getPendingExec(id: string): PendingExec | undefined {
  const pending = _pendingExecs.get(id);
  if (!pending) return undefined;
  if (nowMs() > pending.expiresAt) {
    _pendingExecs.delete(id);
    return undefined;
  }
  return pending;
}

export function deletePendingExec(id: string): void {
  _pendingExecs.delete(id);
}

// ── SSH Execution ───────────────────────────────────────

export async function executeSSH(input: {
  host: string;
  port?: number;
  user?: string;
  command: string;
  timeout?: number;
}): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const { execFile } = await import("child_process");
  const { promisify } = await import("util");
  const execFileAsync = promisify(execFile);

  const port = input.port ?? 22;
  const user = input.user ?? "root";
  const timeout = input.timeout ?? 30000;

  try {
    const { stdout, stderr } = await execFileAsync(
      "ssh",
      [
        "-o", "StrictHostKeyChecking=no",
        "-o", `ConnectTimeout=10`,
        "-p", String(port),
        `${user}@${input.host}`,
        input.command,
      ],
      { encoding: "utf-8", timeout, maxBuffer: 5 * 1024 * 1024 },
    );

    return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0 };
  } catch (err: any) {
    return {
      stdout: (err.stdout ?? "").trim(),
      stderr: (err.stderr ?? err.message ?? "").trim(),
      exitCode: err.code ?? 1,
    };
  }
}

// ── VM Registry (stored in collections) ─────────────────

export interface VMInfo {
  name: string;
  host: string;
  port: number;
  user: string;
  description?: string;
}

// VMs are stored in a collection "VMs" via add_row tool
// This helper finds VM by name from collection data
export function matchVM(vms: VMInfo[], query: string): VMInfo | undefined {
  const q = query.toLowerCase();
  return vms.find(v =>
    v.name.toLowerCase().includes(q) ||
    v.host.includes(q)
  );
}

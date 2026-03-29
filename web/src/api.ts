export const API = import.meta.env.VITE_API_URL || "http://192.168.1.183:3102/api";

export async function apiFetch<T = any>(path: string): Promise<T> {
  const r = await fetch(API + path);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function apiPost<T = any>(path: string, body: unknown): Promise<T> {
  const r = await fetch(API + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function apiPut<T = any>(path: string, body: unknown): Promise<T> {
  const r = await fetch(API + path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function apiDelete(path: string): Promise<void> {
  const r = await fetch(API + path, { method: "DELETE" });
  if (!r.ok) throw new Error(await r.text());
}

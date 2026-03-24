const BASE = "/api";

const fetchOpts: RequestInit = { credentials: "include" };

async function readError(res: Response): Promise<string> {
  const text = await res.text();
  if (!text) return res.statusText || `HTTP ${res.status}`;
  try {
    const j = JSON.parse(text) as {
      error?: string;
      message?: string | string[];
    };
    if (Array.isArray(j.message)) return j.message.join(", ");
    if (typeof j.message === "string") return j.message;
    return j.error ?? text;
  } catch {
    return text;
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { ...fetchOpts, method: "GET" });
  if (!res.ok) throw new Error(await readError(res));
  return res.json() as Promise<T>;
}

export async function apiSendJson<T>(
  path: string,
  method: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...fetchOpts,
    method,
    headers:
      body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(await readError(res));
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export async function apiDelete(path: string): Promise<void> {
  const res = await fetch(`${BASE}${path}`, { ...fetchOpts, method: "DELETE" });
  if (!res.ok) throw new Error(await readError(res));
}

/** GET binary (e.g. Excel export) with auth cookies. */
export async function apiGetBlob(path: string): Promise<Blob> {
  const res = await fetch(`${BASE}${path}`, { ...fetchOpts, method: "GET" });
  if (!res.ok) throw new Error(await readError(res));
  return res.blob();
}

/** GET plain text/HTML with auth cookies. */
export async function apiGetText(path: string): Promise<string> {
  const res = await fetch(`${BASE}${path}`, { ...fetchOpts, method: "GET" });
  if (!res.ok) throw new Error(await readError(res));
  return res.text();
}

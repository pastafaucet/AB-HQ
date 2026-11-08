import "server-only";
import { createSign } from "node:crypto";

// Minimal Google Sheets client for a service account: signs its own JWT,
// trades it for an access token, and calls the Sheets REST API. Server only.
// Env: GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, HOURS_SHEET_ID.

const SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const API = "https://sheets.googleapis.com/v4/spreadsheets";

let token: { value: string; exp: number } | null = null;

export function sheetsConfigured(): boolean {
  return !!(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    process.env.GOOGLE_PRIVATE_KEY &&
    process.env.HOURS_SHEET_ID
  );
}

export function hoursSheetId(): string {
  const id = process.env.HOURS_SHEET_ID;
  if (!id) throw new Error("HOURS_SHEET_ID is not set.");
  return id;
}

const b64url = (s: string | Buffer) =>
  Buffer.from(s).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function accessToken(): Promise<string> {
  if (token && token.exp - 60 > Date.now() / 1000) return token.value;
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  // Vercel stores the key with literal "\n" sequences; restore real newlines.
  const key = (process.env.GOOGLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n").replace(/^"|"$/g, "");
  if (!email || !key) throw new Error("Google service account env vars are not set.");
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({ iss: email, scope: SCOPE, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const sig = b64url(signer.sign(key));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${sig}`,
    }),
  });
  const j = (await res.json()) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !j.access_token) throw new Error(`Google sign-in failed: ${j.error_description ?? res.status}`);
  token = { value: j.access_token, exp: now + (j.expires_in ?? 3600) };
  return token.value;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}/${hoursSheetId()}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" },
    cache: "no-store",
  });
  const j = await res.json();
  if (!res.ok) {
    const msg = (j as { error?: { message?: string } }).error?.message ?? String(res.status);
    if (res.status === 403) throw new Error(`The sheet refused access (share it with the service account as Editor): ${msg}`);
    throw new Error(`Google Sheets: ${msg}`);
  }
  return j as T;
}

export type Cell = string | number | boolean | null;
type Render = "FORMATTED_VALUE" | "UNFORMATTED_VALUE";

/** Read one range. */
export async function getRange(range: string, render: Render = "FORMATTED_VALUE"): Promise<Cell[][]> {
  const q = new URLSearchParams({ valueRenderOption: render, dateTimeRenderOption: "SERIAL_NUMBER" });
  const j = await call<{ values?: Cell[][] }>(`/values/${encodeURIComponent(range)}?${q}`);
  return j.values ?? [];
}

/** Read several ranges in one call. */
export async function getRanges(ranges: string[], render: Render = "FORMATTED_VALUE"): Promise<Cell[][][]> {
  const q = new URLSearchParams({ valueRenderOption: render, dateTimeRenderOption: "SERIAL_NUMBER" });
  for (const r of ranges) q.append("ranges", r);
  const j = await call<{ valueRanges?: { values?: Cell[][] }[] }>(`/values:batchGet?${q}`);
  return (j.valueRanges ?? []).map((v) => v.values ?? []);
}

/** Write one range as if typed (dates and numbers parse). null cells are left alone. */
export async function setRange(range: string, values: Cell[][]): Promise<void> {
  await call(`/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, {
    method: "PUT",
    body: JSON.stringify({ range, majorDimension: "ROWS", values }),
  });
}

/** Structural changes (insert a row). */
export async function batchUpdate(requests: unknown[]): Promise<void> {
  await call(`:batchUpdate`, { method: "POST", body: JSON.stringify({ requests }) });
}

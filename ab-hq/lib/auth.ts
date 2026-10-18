// Edge-safe session token: HMAC-SHA256 signed payload with an expiry.
// Works in both Next middleware (edge) and server actions (node) via Web Crypto.
// Single-user gate — the token proves "someone entered the password", nothing more.

export const SESSION_COOKIE = "ab_hq_session";

const enc = new TextEncoder();
const dec = new TextDecoder();

function toB64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

async function signB64(secret: string, payloadB: string): Promise<string> {
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(payloadB))
  );
  return toB64url(sig);
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Sign an arbitrary JSON payload (it must carry its own `exp` if it expires). */
export async function signPayload(secret: string, payload: object): Promise<string> {
  const payloadB = toB64url(enc.encode(JSON.stringify(payload)));
  return `${payloadB}.${await signB64(secret, payloadB)}`;
}

/** Verify a signPayload token; returns the payload, or null if forged or expired. */
export async function verifyPayload<T extends { exp?: number }>(
  secret: string,
  token: string | undefined | null
): Promise<T | null> {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const payloadB = token.slice(0, dot);
  try {
    const expected = fromB64url(await signB64(secret, payloadB));
    if (!sameBytes(expected, fromB64url(token.slice(dot + 1)))) return null;
    const payload = JSON.parse(dec.decode(fromB64url(payloadB))) as T;
    if (typeof payload.exp === "number" && payload.exp <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/** SHA-256 → base64url, for PKCE S256. */
export async function sha256B64url(input: string): Promise<string> {
  return toB64url(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(input))));
}

/** Create a signed session token valid for `days`. */
export async function createSession(secret: string, days = 30): Promise<string> {
  const payload = JSON.stringify({ exp: Date.now() + days * 86_400_000 });
  const payloadB = toB64url(enc.encode(payload));
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(payloadB))
  );
  return `${payloadB}.${toB64url(sig)}`;
}

/** Verify signature + expiry. Returns true only for a valid, unexpired token. */
export async function verifySession(
  secret: string,
  token: string | undefined | null
): Promise<boolean> {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot < 1) return false;
  const payloadB = token.slice(0, dot);
  const sigB = token.slice(dot + 1);

  const expected = new Uint8Array(
    await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(payloadB))
  );
  const got = fromB64url(sigB);
  if (expected.length !== got.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ got[i];
  if (diff !== 0) return false;

  try {
    const { exp } = JSON.parse(dec.decode(fromB64url(payloadB)));
    return typeof exp === "number" && exp > Date.now();
  } catch {
    return false;
  }
}

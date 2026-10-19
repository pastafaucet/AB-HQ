import { signPayload, verifyPayload, sha256B64url } from "@/lib/auth";

// ============================================================
// A minimal OAuth 2.1 authorization server, just enough for Claude's
// custom connector to sign in to AB HQ. Single user, so everything is
// stateless: client ids, codes, and tokens are HMAC-signed payloads.
//   • Approval requires the AB HQ passcode session (the consent page
//     sits behind the middleware gate).
//   • Codes only ever go to an allowlisted redirect (claude.ai's
//     callback, or a loopback address for local clients).
//   • PKCE S256 is mandatory.
// To cut off every connected client at once, bump MCP_TOKEN_VERSION.
// ============================================================

export const MCP_PATH = "/api/mcp";
export const SCOPES = ["abhq.read", "abhq.write", "offline_access"];
export const CLAUDE_CALLBACK = "https://claude.ai/api/mcp/auth_callback";

const ACCESS_TTL_S = 60 * 60; // 1 hour
const REFRESH_TTL_MS = 90 * 86_400_000; // 90 days
const CODE_TTL_MS = 5 * 60_000;

/** A key distinct from the passcode session's, so neither token works as the other. */
function oauthSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not set");
  return `${s}:oauth`;
}

function tokenVersion(): string {
  return process.env.MCP_TOKEN_VERSION ?? "1";
}

export function resourceFor(origin: string): string {
  return `${origin}${MCP_PATH}`;
}

/** claude.ai's callback, or loopback (RFC 8252) for local MCP clients. */
export function isAllowedRedirect(uri: string): boolean {
  if (uri === CLAUDE_CALLBACK) return true;
  try {
    const u = new URL(uri);
    return u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
  } catch {
    return false;
  }
}

// ---------- clients ----------

interface ClientPayload {
  typ: "client";
  r: string[]; // redirect uris
  n: string; // display name
}

/** Dynamic Client Registration: the client id is a signed record of its redirects. */
export async function registerClient(redirectUris: string[], name: string): Promise<string> {
  return signPayload(oauthSecret(), { typ: "client", r: redirectUris, n: name } satisfies ClientPayload);
}

/**
 * Resolve a client id to its name and registered redirects. Accepts our own
 * DCR ids and Client ID Metadata Documents (an https URL serving JSON).
 */
export async function resolveClient(
  clientId: string
): Promise<{ name: string; redirectUris: string[] } | null> {
  if (clientId.startsWith("https://")) {
    try {
      const res = await fetch(clientId, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return null;
      const doc = (await res.json()) as { client_id?: string; client_name?: string; redirect_uris?: string[] };
      if (doc.client_id !== clientId || !Array.isArray(doc.redirect_uris)) return null;
      return { name: doc.client_name ?? new URL(clientId).hostname, redirectUris: doc.redirect_uris };
    } catch {
      return null;
    }
  }
  const p = await verifyPayload<ClientPayload & { exp?: number }>(oauthSecret(), clientId);
  if (!p || p.typ !== "client") return null;
  return { name: p.n, redirectUris: p.r };
}

export interface AuthorizeRequest {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scope: string;
  resource: string;
  state: string | null;
}

/** Validate the parameters of an /authorize request. Returns the client's name or an error. */
export async function validateAuthorize(
  params: URLSearchParams,
  origin: string
): Promise<{ ok: true; req: AuthorizeRequest; clientName: string } | { ok: false; error: string; redirectable: boolean }> {
  const clientId = params.get("client_id") ?? "";
  const redirectUri = params.get("redirect_uri") ?? "";
  const client = clientId ? await resolveClient(clientId) : null;
  if (!client) return { ok: false, error: "Unknown client.", redirectable: false };
  if (!redirectUri || !client.redirectUris.includes(redirectUri) || !isAllowedRedirect(redirectUri)) {
    return { ok: false, error: "That redirect address isn't allowed.", redirectable: false };
  }
  // From here on, errors can safely go back to the client's redirect.
  if (params.get("response_type") !== "code") {
    return { ok: false, error: "unsupported_response_type", redirectable: true };
  }
  const codeChallenge = params.get("code_challenge") ?? "";
  if (!codeChallenge || params.get("code_challenge_method") !== "S256") {
    return { ok: false, error: "invalid_request", redirectable: true };
  }
  const resource = params.get("resource") ?? resourceFor(origin);
  if (resource !== resourceFor(origin)) return { ok: false, error: "invalid_target", redirectable: true };
  // Approval grants read and write; Claude still asks Andy before each change.
  const requested = (params.get("scope") ?? "").split(/\s+/).filter(Boolean);
  const scope = ["abhq.read", "abhq.write", ...(requested.includes("offline_access") ? ["offline_access"] : [])];
  return {
    ok: true,
    clientName: client.name,
    req: { clientId, redirectUri, codeChallenge, scope: scope.join(" "), resource, state: params.get("state") },
  };
}

// ---------- codes & tokens ----------

interface CodePayload {
  typ: "code";
  c: string;
  r: string;
  ch: string;
  sc: string;
  aud: string;
  exp: number;
}

interface TokenPayload {
  typ: "at" | "rt";
  c: string;
  sc: string;
  aud: string;
  v: string;
  exp: number;
  n?: string;
}

export async function issueCode(req: AuthorizeRequest): Promise<string> {
  return signPayload(oauthSecret(), {
    typ: "code",
    c: req.clientId,
    r: req.redirectUri,
    ch: req.codeChallenge,
    sc: req.scope,
    aud: req.resource,
    exp: Date.now() + CODE_TTL_MS,
  } satisfies CodePayload);
}

async function issueTokens(clientId: string, scope: string, aud: string) {
  const base = { c: clientId, sc: scope, aud, v: tokenVersion() };
  const access = await signPayload(oauthSecret(), {
    ...base,
    typ: "at",
    exp: Date.now() + ACCESS_TTL_S * 1000,
  } satisfies TokenPayload);
  const body: Record<string, unknown> = {
    access_token: access,
    token_type: "Bearer",
    expires_in: ACCESS_TTL_S,
    scope,
  };
  if (scope.split(" ").includes("offline_access")) {
    body.refresh_token = await signPayload(oauthSecret(), {
      ...base,
      typ: "rt",
      exp: Date.now() + REFRESH_TTL_MS,
      n: crypto.randomUUID(),
    } satisfies TokenPayload);
  }
  return body;
}

type TokenResult = { ok: true; body: Record<string, unknown> } | { ok: false; error: string; description: string };

export async function exchangeCode(form: URLSearchParams, origin: string): Promise<TokenResult> {
  const code = await verifyPayload<CodePayload>(oauthSecret(), form.get("code"));
  if (!code || code.typ !== "code") return { ok: false, error: "invalid_grant", description: "Code is invalid or expired." };
  if (form.get("client_id") !== code.c) return { ok: false, error: "invalid_grant", description: "Client mismatch." };
  if (form.get("redirect_uri") !== code.r) return { ok: false, error: "invalid_grant", description: "Redirect mismatch." };
  const verifier = form.get("code_verifier") ?? "";
  if (!verifier || (await sha256B64url(verifier)) !== code.ch) {
    return { ok: false, error: "invalid_grant", description: "PKCE verification failed." };
  }
  const resource = form.get("resource");
  if (resource && resource !== code.aud) return { ok: false, error: "invalid_target", description: "Resource mismatch." };
  if (code.aud !== resourceFor(origin)) return { ok: false, error: "invalid_target", description: "Wrong server." };
  return { ok: true, body: await issueTokens(code.c, code.sc, code.aud) };
}

export async function refreshTokens(form: URLSearchParams, origin: string): Promise<TokenResult> {
  const rt = await verifyPayload<TokenPayload>(oauthSecret(), form.get("refresh_token"));
  if (!rt || rt.typ !== "rt" || rt.v !== tokenVersion() || rt.aud !== resourceFor(origin)) {
    return { ok: false, error: "invalid_grant", description: "Refresh token is invalid or expired." };
  }
  const clientId = form.get("client_id");
  if (clientId && clientId !== rt.c) return { ok: false, error: "invalid_grant", description: "Client mismatch." };
  return { ok: true, body: await issueTokens(rt.c, rt.sc, rt.aud) };
}

/** Check a bearer token presented to the MCP endpoint. */
export async function verifyAccessToken(
  token: string | undefined,
  origin: string
): Promise<{ clientId: string; scopes: string[]; expiresAt: number } | null> {
  const at = await verifyPayload<TokenPayload>(oauthSecret(), token);
  if (!at || at.typ !== "at" || at.v !== tokenVersion() || at.aud !== resourceFor(origin)) return null;
  return { clientId: at.c, scopes: at.sc.split(" "), expiresAt: Math.floor(at.exp / 1000) };
}

import { cookies } from "next/headers";
import { getPublicOrigin } from "mcp-handler";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { issueCode, validateAuthorize } from "@/lib/oauth";

// The consent form posts here. Everything is re-validated: the hidden
// fields are only a convenience, never trusted on their own.

export async function POST(req: Request) {
  const secret = process.env.SESSION_SECRET;
  const jar = await cookies();
  if (!secret || !(await verifySession(secret, jar.get(SESSION_COOKIE)?.value))) {
    return new Response("Sign in to AB HQ first.", { status: 401 });
  }

  const form = await req.formData();
  const params = new URLSearchParams();
  for (const [k, v] of form.entries()) if (typeof v === "string") params.set(k, v);

  const origin = getPublicOrigin(req);
  const check = await validateAuthorize(params, origin);
  if (!check.ok) {
    if (!check.redirectable) return new Response(check.error, { status: 400 });
    return redirectWith(params.get("redirect_uri")!, { error: check.error, state: params.get("state") });
  }

  if (params.get("decision") !== "approve") {
    return redirectWith(check.req.redirectUri, { error: "access_denied", state: check.req.state });
  }
  const code = await issueCode(check.req);
  return redirectWith(check.req.redirectUri, { code, state: check.req.state, iss: origin });
}

function redirectWith(uri: string, query: Record<string, string | null>): Response {
  const to = new URL(uri);
  for (const [k, v] of Object.entries(query)) if (v) to.searchParams.set(k, v);
  return new Response(null, { status: 303, headers: { Location: to.toString(), "Cache-Control": "no-store" } });
}

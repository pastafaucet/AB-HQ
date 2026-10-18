import { getPublicOrigin } from "mcp-handler";
import { exchangeCode, refreshTokens } from "@/lib/oauth";

const NO_STORE = { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" };

export async function POST(req: Request) {
  const type = req.headers.get("content-type") ?? "";
  const form = type.includes("application/json")
    ? new URLSearchParams(Object.entries(await req.json()).map(([k, v]) => [k, String(v)]))
    : new URLSearchParams(await req.text());
  const origin = getPublicOrigin(req);

  const grant = form.get("grant_type");
  const result =
    grant === "authorization_code"
      ? await exchangeCode(form, origin)
      : grant === "refresh_token"
        ? await refreshTokens(form, origin)
        : ({ ok: false, error: "unsupported_grant_type", description: "Use authorization_code or refresh_token." } as const);

  if (!result.ok) {
    return Response.json({ error: result.error, error_description: result.description }, { status: 400, headers: NO_STORE });
  }
  return Response.json(result.body, { headers: NO_STORE });
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: { ...NO_STORE, "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "Content-Type" },
  });
}

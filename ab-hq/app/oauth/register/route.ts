import { isAllowedRedirect, registerClient } from "@/lib/oauth";

// Dynamic Client Registration (RFC 7591). Public clients only; the client id
// is a signed record of the allowed redirects, so nothing is stored.

export async function POST(req: Request) {
  let body: { redirect_uris?: unknown; client_name?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_client_metadata", error_description: "Body must be JSON." }, { status: 400 });
  }
  const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((u) => typeof u === "string") : [];
  if (uris.length === 0 || !uris.every(isAllowedRedirect)) {
    return Response.json(
      { error: "invalid_redirect_uri", error_description: "Only Claude's callback or a loopback address is allowed." },
      { status: 400 }
    );
  }
  const name = typeof body.client_name === "string" && body.client_name.trim() ? body.client_name.trim().slice(0, 80) : "MCP client";
  const clientId = await registerClient(uris as string[], name);
  return Response.json(
    {
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: name,
      redirect_uris: uris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
    { status: 201, headers: { "Cache-Control": "no-store" } }
  );
}

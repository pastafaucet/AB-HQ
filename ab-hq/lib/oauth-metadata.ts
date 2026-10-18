import { generateProtectedResourceMetadata, getPublicOrigin } from "mcp-handler";
import { SCOPES, resourceFor } from "@/lib/oauth";

// Discovery documents for Claude's connector sign-in.

/** The public origin for a page render, where only headers are available. */
export function originFromHeaders(h: Headers): string {
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim();
  const local = /^(localhost|127\.0\.0\.1)(:|$)/.test(host);
  const proto = h.get("x-forwarded-proto")?.split(",")[0].trim() || (local ? "http" : "https");
  return `${proto}://${host}`;
}

const CORS ={ "Access-Control-Allow-Origin": "*", "Cache-Control": "max-age=3600" };

/** RFC 8414 authorization server metadata. */
export function authServerMetadata(req: Request): Response {
  const origin = getPublicOrigin(req);
  return Response.json(
    {
      issuer: origin,
      authorization_endpoint: `${origin}/oauth/authorize`,
      token_endpoint: `${origin}/oauth/token`,
      registration_endpoint: `${origin}/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: SCOPES,
      client_id_metadata_document_supported: true,
    },
    { headers: CORS }
  );
}

/** RFC 9728 protected resource metadata. The resource is always the MCP URL itself. */
export function protectedResourceMetadata(req: Request): Response {
  const origin = getPublicOrigin(req);
  return Response.json(
    generateProtectedResourceMetadata({
      authServerUrls: [origin],
      resourceUrl: resourceFor(origin),
      additionalMetadata: {
        scopes_supported: SCOPES,
        bearer_methods_supported: ["header"],
        resource_name: "AB HQ",
      },
    }),
    { headers: CORS }
  );
}

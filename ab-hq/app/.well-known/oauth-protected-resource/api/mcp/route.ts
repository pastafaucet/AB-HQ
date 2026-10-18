import { metadataCorsOptionsRequestHandler } from "mcp-handler";
import { protectedResourceMetadata } from "@/lib/oauth-metadata";

// RFC 9728 path-suffixed form for the resource at /api/mcp.
export const GET = protectedResourceMetadata;
export const OPTIONS = metadataCorsOptionsRequestHandler();

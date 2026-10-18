import { metadataCorsOptionsRequestHandler } from "mcp-handler";
import { authServerMetadata } from "@/lib/oauth-metadata";

export const GET = authServerMetadata;
export const OPTIONS = metadataCorsOptionsRequestHandler();

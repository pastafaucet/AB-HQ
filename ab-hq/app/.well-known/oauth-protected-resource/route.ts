import { metadataCorsOptionsRequestHandler } from "mcp-handler";
import { protectedResourceMetadata } from "@/lib/oauth-metadata";

export const GET = protectedResourceMetadata;
export const OPTIONS = metadataCorsOptionsRequestHandler();

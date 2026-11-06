import "server-only";
import { cookies } from "next/headers";
import { parseScope, SCOPE_COOKIE, type Scope } from "@/lib/scope";

/** The current All / Work / Personal scope from the request cookie. */
export async function getScope(): Promise<Scope> {
  return parseScope((await cookies()).get(SCOPE_COOKIE)?.value);
}

// The header's All / Work / Personal toggle. Stored in a cookie so server
// queries can filter before anything renders.
import type { Domain } from "@/lib/data";

export type Scope = "all" | "work" | "personal";

export const SCOPE_COOKIE = "abhq_scope";

export function parseScope(v: string | undefined | null): Scope {
  return v === "work" || v === "personal" ? v : "all";
}

/** The task domain a scope keeps, or null for everything. */
export function scopeDomain(s: Scope): Domain | null {
  return s === "work" ? "Work" : s === "personal" ? "Personal" : null;
}

/** Keep only rows in scope. Rows without a domain count as Work (the column default). */
export function inScope<T extends { domain?: string | null }>(rows: T[], s: Scope): T[] {
  const d = scopeDomain(s);
  return d ? rows.filter((r) => (r.domain ?? "Work") === d) : rows;
}

/** Save the scope for the server to read (browser only). */
export function rememberScope(s: Scope) {
  document.cookie = `${SCOPE_COOKIE}=${s}; path=/; max-age=31536000; samesite=lax`;
}

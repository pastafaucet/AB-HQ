"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSession, SESSION_COOKIE } from "@/lib/auth";

/** Only same-site paths: "/x" but never "//host" or "/\host". */
function safeNext(raw: FormDataEntryValue | null): string {
  const next = typeof raw === "string" ? raw : "";
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}

export async function login(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const expected = process.env.APP_PASSWORD;
  const secret = process.env.SESSION_SECRET;
  const next = safeNext(formData.get("next"));
  const keep = next === "/" ? "" : `&next=${encodeURIComponent(next)}`;

  if (!expected || !secret) redirect(`/login?error=config${keep}`);
  if (password !== expected) redirect(`/login?error=1${keep}`);

  const token = await createSession(secret);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  redirect(next);
}

export async function logout() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}

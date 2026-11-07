"use server";

import { getSupabase } from "@/lib/supabase";
import {
  getCasesPageData,
  getNotesPageData,
  getPeoplePageData,
  getProjectsPageData,
  getTaskDrawerData,
} from "@/lib/queries";

// Loaders for the drawer host: open any item, from any page, by id. Each
// reuses the query its own hub uses, so a drawer shows exactly what the hub
// would. One user and modest volumes make the hub-sized reads acceptable.

export async function loadTaskDrawer(id: string) {
  return getTaskDrawerData(id);
}

export async function loadCaseDrawer(id: string) {
  const { cases, today } = await getCasesPageData();
  return { matter: cases.find((c) => c.id === id) ?? null, today };
}

export async function loadProjectDrawer(id: string) {
  const { projects, matters, today } = await getProjectsPageData();
  return { project: projects.find((p) => p.id === id) ?? null, matters, today };
}

export async function loadPersonDrawer(id: string) {
  const { people, matters } = await getPeoplePageData();
  return { person: people.find((p) => p.id === id) ?? null, matters };
}

export async function loadNoteDrawer(id: string) {
  const data = await getNotesPageData(id);
  return { ...data, note: data.notes[0] ?? null };
}

// ---- ⌘J: jump to anything ----

export type JumpKind = "case" | "project" | "task" | "note" | "person";

export interface JumpHit {
  kind: JumpKind;
  id: string;
  title: string;
  sub: string | null;
}

/** Title search across cases, projects, tasks, notes and people. */
export async function jumpSearch(query: string): Promise<JumpHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  // PostgREST ilike pattern; strip characters that would break the or() filter.
  const pat = `%${q.replace(/[%_,()*]/g, " ").trim()}%`;
  const sb = getSupabase();
  const since = new Date(Date.now() - 60 * 86400000).toISOString();

  const [matters, projects, openTasks, doneTasks, notes, people] = await Promise.all([
    sb
      .from("matters")
      .select("id,name,client,status,disposition")
      .or(`name.ilike.${pat},client.ilike.${pat}`)
      .limit(8),
    sb.from("projects").select("id,name,status").ilike("name", pat).limit(6),
    sb
      .from("tasks")
      .select("id,title,do_date,status")
      .ilike("title", pat)
      .not("status", "in", '("Done","Cancelled")')
      .order("do_date", { ascending: true, nullsFirst: false })
      .limit(8),
    sb
      .from("tasks")
      .select("id,title,completed_at")
      .ilike("title", pat)
      .eq("status", "Done")
      .gte("completed_at", since)
      .order("completed_at", { ascending: false })
      .limit(4),
    sb
      .from("notes")
      .select("id,title,status,updated_at")
      .ilike("title", pat)
      .order("updated_at", { ascending: false })
      .limit(8),
    sb.from("people").select("id,name,org").or(`name.ilike.${pat},org.ilike.${pat}`).limit(6),
  ]);

  const hits: JumpHit[] = [];
  for (const m of (matters.data ?? []) as {
    id: string;
    name: string;
    client: string | null;
    status: string | null;
    disposition: string | null;
  }[])
    hits.push({
      kind: "case",
      id: m.id,
      title: m.name,
      sub: [m.client, m.status === "Closed" || m.disposition ? "closed" : null]
        .filter(Boolean)
        .join(" · ") || null,
    });
  for (const p of (projects.data ?? []) as { id: string; name: string; status: string }[])
    hits.push({ kind: "project", id: p.id, title: p.name, sub: p.status === "Active" ? null : p.status });
  for (const t of (openTasks.data ?? []) as { id: string; title: string; do_date: string | null }[])
    hits.push({ kind: "task", id: t.id, title: t.title, sub: t.do_date });
  for (const t of (doneTasks.data ?? []) as { id: string; title: string }[])
    hits.push({ kind: "task", id: t.id, title: t.title, sub: "done" });
  for (const n of (notes.data ?? []) as { id: string; title: string | null; status: string }[])
    if (n.title) hits.push({ kind: "note", id: n.id, title: n.title, sub: n.status === "Archived" ? "archived" : null });
  for (const p of (people.data ?? []) as { id: string; name: string; org: string | null }[])
    hits.push({ kind: "person", id: p.id, title: p.name, sub: p.org });

  // Titles that start with the query rank first; otherwise keep group order.
  const lower = q.toLowerCase();
  return hits
    .map((h, i) => ({ h, i, starts: h.title.toLowerCase().startsWith(lower) ? 0 : 1 }))
    .sort((a, b) => a.starts - b.starts || a.i - b.i)
    .map((x) => x.h);
}

import type { AuthInfo } from "@modelcontextprotocol/server";
import { createMcpHandler, getPublicOrigin, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import { verifyAccessToken } from "@/lib/oauth";
import { getCase, getNote, getToday, listCases, listOpenTasks, searchNotes } from "@/lib/assistant-tools";
import { addTasks, capture, changeTask, saveMeeting } from "@/lib/assistant-writes";

// AB HQ as a Claude connector (MCP over Streamable HTTP). Every request
// needs a bearer token from AB HQ's own sign-in; changes also need the
// abhq.write scope, and Claude asks Andy before running them.

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, openWorldHint: false } as const;
const WRITES = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;

function json(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }] };
}

function canWrite(ctx: { http?: { authInfo?: AuthInfo } }): boolean {
  return !!ctx.http?.authInfo?.scopes.includes("abhq.write");
}

const READ_ONLY_CONNECTION = json({
  error:
    "This connection was approved for reading only. In Claude, open Settings → Connectors → AB HQ, disconnect, then connect again to allow changes.",
});

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("YYYY-MM-DD, Pacific time");
const TIME = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).describe("24-hour HH:MM, Pacific time");
const STATUS = z.enum(["Inbox", "To Do", "In Progress", "Done", "Someday", "Cancelled"]);
const WAITING = z.enum(["Chris", "Opposing Counsel", "Court", "Other"]);

const NEW_TASK = z.object({
  title: z.string().min(1).describe("Short and actionable, in Andy's words where possible"),
  type: z.enum(["Task", "Event", "Deadline"]).optional().describe("Default Task. Events are things with a time; Deadlines are due dates."),
  priority: z.number().int().min(1).max(4).optional().describe("1 = P1 urgent … 4 = P4 someday. Default 3."),
  date: DATE.optional().describe("The do date"),
  time: TIME.optional(),
  estimateMin: z.number().int().min(5).max(1440).optional().describe("Only if Andy gave one; never invent estimates"),
  matter: z.string().optional().describe("Exact case name from list_cases"),
  project: z.string().optional(),
  domain: z.enum(["Work", "Personal"]).optional().describe("Default Work"),
  notes: z.string().optional(),
  mit: z.boolean().optional().describe("Make it one of today's three protected MITs (max 3)"),
  waitingOn: WAITING.optional(),
});

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "get_today",
      {
        title: "Today in AB HQ",
        description:
          "Andy's day: today's protected MITs (Top 3), timed events on the schedule, other tasks due today, overdue tasks, in-progress work, the running timer, the day's intention, and what Wind Down put 'on tap' from yesterday. Start here for any question about today.",
        inputSchema: z.object({}),
        annotations: READ_ONLY,
      },
      async () => json(await getToday())
    );

    server.registerTool(
      "list_open_tasks",
      {
        title: "Open tasks",
        description:
          "Open tasks, events, and deadlines, soonest first. Filter by case name, a window of days ahead (overdue items are included), priority ceiling (1 = P1 only, 2 = P1–P2), domain, or type. Someday items are excluded unless asked for.",
        inputSchema: z.object({
          matter: z.string().optional().describe("Case name, client, or case number (partial match)"),
          dueWithinDays: z.number().int().min(0).max(365).optional().describe("Only items dated within this many days from today, plus overdue"),
          maxPriority: z.number().int().min(1).max(4).optional(),
          domain: z.enum(["Work", "Personal"]).optional(),
          type: z.enum(["Task", "Event", "Deadline"]).optional(),
          includeSomeday: z.boolean().optional(),
          limit: z.number().int().min(1).max(200).optional(),
        }),
        annotations: READ_ONLY,
      },
      async (args) => json(await listOpenTasks(args))
    );

    server.registerTool(
      "list_cases",
      {
        title: "Cases",
        description:
          "Andy's litigation matters with stage, status, court, next deadline, and open/overdue task counts, soonest deadline first. Optionally filter by name, client, or case number. Closed cases are excluded unless includeClosed is true.",
        inputSchema: z.object({
          query: z.string().optional(),
          includeClosed: z.boolean().optional(),
        }),
        annotations: READ_ONLY,
      },
      async (args) => json(await listCases(args))
    );

    server.registerTool(
      "get_case",
      {
        title: "Case detail",
        description:
          "Everything on one case: details, open tasks, tasks finished in the last 30 days, projects, people (opposing counsel, judge, experts), the 25 most recent captured entries (Andy's running notes and billed time), and linked notes. If the name matches several cases, returns the candidates instead.",
        inputSchema: z.object({ name: z.string().describe("Case name, client, or case number") }),
        annotations: READ_ONLY,
      },
      async (args) => json(await getCase(args))
    );

    server.registerTool(
      "search_notes",
      {
        title: "Search notes",
        description:
          "Search Andy's notes. Every word must appear (in the title or body). Returns titles, dates, and snippets; use get_note for the full text.",
        inputSchema: z.object({
          query: z.string().min(1),
          limit: z.number().int().min(1).max(50).optional(),
          includeArchived: z.boolean().optional(),
        }),
        annotations: READ_ONLY,
      },
      async (args) => json(await searchNotes(args))
    );

    server.registerTool(
      "get_note",
      {
        title: "Read a note",
        description: "The full text of one note, with its tags and linked cases. Takes an id from search_notes or get_case.",
        inputSchema: z.object({ id: z.string().uuid() }),
        annotations: READ_ONLY,
      },
      async (args) => json(await getNote(args))
    );

    // ---------------- changes ----------------

    server.registerTool(
      "add_tasks",
      {
        title: "Add tasks",
        description:
          "Add one or more tasks, events, or deadlines to AB HQ in a single step (up to 25). Before adding, check the case's open tasks so you don't create duplicates. Show Andy the list you intend to add.",
        inputSchema: z.object({ tasks: z.array(NEW_TASK).min(1).max(25) }),
        annotations: WRITES,
      },
      async ({ tasks }, ctx) => (canWrite(ctx) ? json(await addTasks(tasks)) : READ_ONLY_CONNECTION)
    );

    server.registerTool(
      "update_task",
      {
        title: "Update a task",
        description:
          "Change one existing task: complete it (status Done), reschedule it (date/time; null clears), change priority, make it a MIT or not, rename it, move it to another case, or edit its notes. Takes the id from get_today, list_open_tasks, or get_case. Returns the task before and after.",
        inputSchema: z.object({
          id: z.string().uuid(),
          title: z.string().min(1).optional(),
          status: STATUS.optional(),
          type: z.enum(["Task", "Event", "Deadline"]).optional(),
          priority: z.number().int().min(1).max(4).optional(),
          date: DATE.nullable().optional(),
          time: TIME.nullable().optional(),
          estimateMin: z.number().int().min(5).max(1440).nullable().optional(),
          mit: z.boolean().optional(),
          matter: z.string().nullable().optional().describe("Exact case name, or null to unlink"),
          project: z.string().nullable().optional(),
          domain: z.enum(["Work", "Personal"]).optional(),
          notes: z.string().nullable().optional(),
          waitingOn: WAITING.nullable().optional(),
        }),
        annotations: WRITES,
      },
      async (args, ctx) => (canWrite(ctx) ? json(await changeTask(args)) : READ_ONLY_CONNECTION)
    );

    server.registerTool(
      "capture",
      {
        title: "Capture (⌘K)",
        description:
          "Exactly what Andy's ⌘K capture box does: saves the text verbatim to his ledger, files it to the right case, and creates a task if it implies one. Use it for running notes on a case (\"talked to Ken, he's against the DA filter\") and for time entries written with tenths, e.g. \"Tia - call with OC re cash sweep (.4)\". Pass Andy's words as he said them.",
        inputSchema: z.object({ text: z.string().min(1) }),
        annotations: WRITES,
      },
      async ({ text }, ctx) => (canWrite(ctx) ? json(await capture(text)) : READ_ONLY_CONNECTION)
    );

    server.registerTool(
      "save_meeting",
      {
        title: "Save a meeting to AB HQ",
        description:
          "Save a recorded meeting from Notion into AB HQ as a meeting note linked to its case. Read the meeting in Notion first, then pass the Notion link plus your own short summary, the decisions, the action items, key points, and attendees. Do NOT pass the transcript: AB HQ fetches the full record (Notion's notes and the conversation) straight from Notion. Saving the same Notion link again refreshes the existing note. Afterwards, offer to add the action items as tasks with add_tasks.",
        inputSchema: z.object({
          notionUrl: z.string().url().describe("The Notion link to the meeting note"),
          title: z.string().min(1).describe("A descriptive title, e.g. 'CEO AB 218 Meeting'"),
          date: DATE.describe("The meeting date"),
          matter: z.string().optional().describe("Exact case name from list_cases"),
          summary: z.string().min(1).describe("3–6 sentences: what the meeting was about and where things landed"),
          decisions: z.array(z.string()).optional(),
          actionItems: z.array(z.string()).optional().describe("Each with its owner when known"),
          keyPoints: z.array(z.string()).optional(),
          attendees: z.array(z.string()).optional(),
        }),
        annotations: WRITES,
      },
      async (args, ctx) => (canWrite(ctx) ? json(await saveMeeting(args)) : READ_ONLY_CONNECTION)
    );
  },
  {
    serverInfo: { name: "AB HQ", version: "0.2.0" },
    // Claude (MCP 2026-07-28) opens `subscriptions/listen` to hear about
    // tool-list changes. AB HQ's tools never change at runtime, and on Vercel
    // the open stream just runs to the time cap and reopens. Refuse it up front.
    maxSubscriptions: 0,
    instructions:
      "AB HQ is Andy Baum's personal operating system and the source of truth for his tasks, litigation cases, notes, and daily plan. Notion holds his recorded meeting notes; tasks or projects found in Notion are old and never current. Dates are Pacific time. Priorities run P1 (urgent) to P4 (someday). MITs are the day's three protected tasks. Answer from these tools rather than guessing, and name the case when you cite a task. Before changing anything, say exactly what you'll add or change. Never invent dates, estimates, or owners.",
  }
);

async function verify(req: Request, bearer?: string): Promise<AuthInfo | undefined> {
  const at = await verifyAccessToken(bearer, getPublicOrigin(req));
  if (!at) return undefined;
  return { token: bearer!, clientId: at.clientId, scopes: at.scopes, expiresAt: at.expiresAt };
}

const authed = withMcpAuth(handler, verify, {
  required: true,
  requiredScopes: ["abhq.read"],
  resourceMetadataPath: "/.well-known/oauth-protected-resource/api/mcp",
});

// No legitimate request runs long; cap a stuck stream well below Vercel's 300 s.
export const maxDuration = 60;

/** Log which MCP methods arrive (never arguments or tokens), to diagnose clients. */
async function logged(req: Request): Promise<Response> {
  if (req.method === "POST") {
    try {
      const body = (await req.clone().json()) as { method?: string; params?: { name?: string } } | { method?: string }[];
      const msgs = Array.isArray(body) ? body : [body];
      const names = msgs.map((m) => (m.method === "tools/call" ? `tools/call:${(m as { params?: { name?: string } }).params?.name}` : m.method));
      console.log(`mcp ${names.join(",")} pv=${req.headers.get("mcp-protocol-version") ?? "-"} accept=${req.headers.get("accept") ?? "-"}`);
    } catch {
      console.log("mcp (unparseable body)");
    }
  } else {
    console.log(`mcp ${req.method} accept=${req.headers.get("accept") ?? "-"}`);
  }
  return authed(req);
}

export { logged as GET, logged as POST, logged as DELETE };

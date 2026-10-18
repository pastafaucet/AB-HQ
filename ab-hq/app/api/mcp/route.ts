import type { AuthInfo } from "@modelcontextprotocol/server";
import { createMcpHandler, getPublicOrigin, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import { verifyAccessToken } from "@/lib/oauth";
import { getCase, getNote, getToday, listCases, listOpenTasks, searchNotes } from "@/lib/assistant-tools";

// AB HQ as a Claude connector (MCP over Streamable HTTP). Read-only for the
// trial. Every request needs a bearer token from AB HQ's own sign-in.

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, openWorldHint: false } as const;

function json(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }] };
}

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
  },
  {
    serverInfo: { name: "AB HQ", version: "0.1.0" },
    instructions:
      "AB HQ is Andy Baum's personal operating system: his tasks, litigation cases, notes, and daily plan. Dates are Pacific time. Priorities run P1 (urgent) to P4 (someday). MITs are the day's three protected tasks. Answer from these tools rather than guessing, and name the case when you cite a task.",
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

export { authed as GET, authed as POST, authed as DELETE };

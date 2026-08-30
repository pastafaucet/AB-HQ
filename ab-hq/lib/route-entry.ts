import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { findRecurPhrase, ruleToJson } from "@/lib/recur";

// AI routing for captured entries: classify the raw text, match it to a
// matter/project, extract dates and delegation, and draft the one-line
// summary that later seeds billing narratives. The raw entry is always
// preserved — routing only annotates it.

export interface RouteResult {
  kind: "log" | "task" | "note" | "event";
  domain: "Work" | "Personal";
  matterId: string | null;
  projectId: string | null;
  title: string | null;
  doDate: string | null; // YYYY-MM-DD
  doTime: string | null; // HH:MM
  durationMin: number | null;
  taskType: "Task" | "Event" | "Deadline" | null;
  priority: number | null;
  waitingOn: "Chris" | "Opposing Counsel" | "Court" | "Other" | null;
  recur: string | null; // JSON rule (lib/recur.ts), parsed from the AI's phrase
  summary: string;
}

const SCHEMA = {
  type: "object",
  properties: {
    kind: {
      type: "string",
      enum: ["log", "task", "note", "event"],
      description:
        "log = a record of something that happened (a call taken, a ruling, work done). task = something that must be done. note = an idea or reference to keep. event = a scheduled occurrence with a date/time (hearing, call, meeting).",
    },
    domain: {
      type: "string",
      enum: ["Work", "Personal"],
      description:
        "Personal for errands, family, health, hobbies (dive club, 3D printing); Work for everything law-practice related. Default Work when unclear.",
    },
    matter_id: {
      type: ["string", "null"],
      description:
        "The id of the matter this entry belongs to, chosen from the provided list. null when no matter clearly matches — never guess between two plausible matters.",
    },
    project_id: {
      type: ["string", "null"],
      description: "The id of the project this belongs to, from the provided list, else null.",
    },
    title: {
      type: ["string", "null"],
      description:
        "For task/event kinds only: a short imperative title suitable for a task list (e.g. 'Serve discovery responses'). null for log/note.",
    },
    do_date: {
      type: ["string", "null"],
      description:
        "YYYY-MM-DD. For tasks: when it's due or should be done. For events: the date it occurs. Resolve relative dates ('Friday', 'tomorrow') against today's date provided. null if no date mentioned.",
    },
    do_time: {
      type: ["string", "null"],
      description:
        "HH:MM 24-hour, for events with a stated time. For a range ('2-3:30pm') this is the START time. null otherwise.",
    },
    duration_min: {
      anyOf: [{ type: "integer" }, { type: "null" }],
      description:
        "Duration in minutes, when stated or implied by a time range ('2-3:30pm' → 90, 'all day' → 480). null when unknown.",
    },
    task_type: {
      anyOf: [{ type: "string", enum: ["Task", "Event", "Deadline"] }, { type: "null" }],
      description:
        "For task/event kinds: Deadline when it is a court-imposed or hard filing date; Event for scheduled occurrences; Task otherwise. null for log/note.",
    },
    priority: {
      anyOf: [{ type: "integer", enum: [1, 2, 3, 4] }, { type: "null" }],
      description:
        "For tasks: 1 = urgent+important (court deadlines, today), 2 = important, 3 = normal, 4 = low. null when not a task or unclear.",
    },
    waiting_on: {
      anyOf: [
        { type: "string", enum: ["Chris", "Opposing Counsel", "Court", "Other"] },
        { type: "null" },
      ],
      description:
        "Who the ball is with if it's not Andy: something owed BY someone else. null when Andy owns the next move.",
    },
    recur_phrase: {
      type: ["string", "null"],
      description:
        "If the entry is explicitly recurring, a normalized phrase: 'every day', 'every weekday', 'every tuesday', 'every other friday', 'every 2 weeks', 'every month on the 15th', '2nd tuesday of the month', 'last workday of the month', 'last friday of the month', 'every year'. null when not recurring.",
    },
    summary: {
      type: "string",
      description:
        "One sentence, past tense where apt, in neutral billing-narrative style (e.g. 'Telephone conference with Dr. Mehta regarding causation opinions.'). Written even for tasks/notes — describe what the entry records. NEVER include time amounts — no '(.4)', no '(25 mins)', no '(0.4 hours)'; time is tracked separately.",
    },
  },
  required: [
    "kind",
    "domain",
    "matter_id",
    "project_id",
    "title",
    "do_date",
    "do_time",
    "duration_min",
    "task_type",
    "priority",
    "waiting_on",
    "recur_phrase",
    "summary",
  ],
  additionalProperties: false,
} as const;

const SYSTEM = `You route captured entries for a litigation attorney's personal system. Each entry is something he typed in the middle of a work day — a call he just took, a date a judge set, something he owes or is owed, an idea. Your job: classify it, attach it to the right matter and project when one clearly matches (matching on party names, case names, nicknames, or context), extract any date, and write the one-line summary. Be conservative with matter matching — a wrong attribution is worse than none. Do not invent dates that were not stated or clearly implied.`;

export function hasRoutingKey(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export async function routeEntry(
  raw: string,
  today: string,
  matters: { id: string; name: string; client: string | null }[],
  projects: { id: string; name: string }[]
): Promise<RouteResult | null> {
  if (!hasRoutingKey()) return null;
  const client = new Anthropic();

  const matterList = matters
    .map((m) => `${m.id} | ${m.name}${m.client ? ` (client: ${m.client})` : ""}`)
    .join("\n");
  const projectList = projects.map((p) => `${p.id} | ${p.name}`).join("\n");

  try {
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 4000,
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: SCHEMA as unknown as Record<string, unknown> },
      },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `Today is ${today} (a ${new Date(`${today}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" })}).

MATTERS:
${matterList || "(none entered yet)"}

PROJECTS:
${projectList || "(none)"}

ENTRY:
${raw}`,
        },
      ],
    });

    if (response.stop_reason === "refusal") return null;
    const block = response.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") return null;
    const j = JSON.parse(block.text) as Record<string, unknown>;

    const matterId =
      typeof j.matter_id === "string" && matters.some((m) => m.id === j.matter_id)
        ? j.matter_id
        : null;
    const projectId =
      typeof j.project_id === "string" && projects.some((p) => p.id === j.project_id)
        ? j.project_id
        : null;

    return {
      kind: (["log", "task", "note", "event"].includes(j.kind as string)
        ? j.kind
        : "log") as RouteResult["kind"],
      domain: j.domain === "Personal" ? "Personal" : "Work",
      matterId,
      projectId,
      title: typeof j.title === "string" && j.title.trim() ? j.title.trim() : null,
      doDate: typeof j.do_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(j.do_date) ? j.do_date : null,
      doTime: typeof j.do_time === "string" && /^\d{2}:\d{2}$/.test(j.do_time) ? j.do_time : null,
      durationMin:
        typeof j.duration_min === "number" && j.duration_min >= 5 && j.duration_min <= 720
          ? Math.round(j.duration_min)
          : null,
      taskType: (["Task", "Event", "Deadline"].includes(j.task_type as string)
        ? j.task_type
        : null) as RouteResult["taskType"],
      priority:
        typeof j.priority === "number" && j.priority >= 1 && j.priority <= 4 ? j.priority : null,
      waitingOn: (["Chris", "Opposing Counsel", "Court", "Other"].includes(j.waiting_on as string)
        ? j.waiting_on
        : null) as RouteResult["waitingOn"],
      recur:
        typeof j.recur_phrase === "string" && j.recur_phrase
          ? (() => {
              const hit = findRecurPhrase(j.recur_phrase as string);
              return hit ? ruleToJson(hit.rule) : null;
            })()
          : null,
      summary: typeof j.summary === "string" ? j.summary : raw,
    };
  } catch {
    // Routing is best-effort — a failed call leaves the entry unrouted, never lost.
    return null;
  }
}

"use server";

import Anthropic from "@anthropic-ai/sdk";
import { getDayLedgerData } from "@/lib/queries";

// First-draft billing narratives from the day's ledger, grouped by matter.
// Time entry becomes editing rather than remembering: the draft is a starting
// point, always reviewed by Andy before it goes anywhere near a bill.

export interface NarrativeDraft {
  matterId: string | null;
  matterName: string;
  totalMinutes: number;
  narrative: string;
}

const SCHEMA = {
  type: "object",
  properties: {
    narratives: {
      type: "array",
      items: {
        type: "object",
        properties: {
          matter_key: {
            type: "string",
            description: "Echo the matter key exactly as given in the input.",
          },
          narrative: {
            type: "string",
            description:
              "The billing narrative for this matter's day: professional past-tense activity descriptions separated by semicolons, e.g. 'Telephone conference with Dr. Mehta regarding causation opinions; reviewed deposition transcript excerpts in preparation for expert disclosure.' No time amounts, no client name, no editorializing.",
          },
        },
        required: ["matter_key", "narrative"],
        additionalProperties: false,
      },
    },
  },
  required: ["narratives"],
  additionalProperties: false,
} as const;

export async function draftNarratives(
  date: string
): Promise<{ ok: boolean; error?: string; drafts: NarrativeDraft[] }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: "AI key not configured.", drafts: [] };
  }
  const { groups } = await getDayLedgerData(date);
  const billable = groups.filter(
    (g) => g.matterId && (g.entries.length || g.sessions.length || g.doneTasks.length)
  );
  if (billable.length === 0) {
    return { ok: false, error: "Nothing attributed to a matter on this day.", drafts: [] };
  }

  const input = billable
    .map((g) => {
      const lines: string[] = [`MATTER ${g.matterId} — ${g.matterName}`];
      for (const e of g.entries) lines.push(`  entry: ${e.summary ?? e.raw}`);
      for (const s of g.sessions) lines.push(`  timed work (${s.minutes}m): ${s.taskTitle}`);
      for (const t of g.doneTasks) lines.push(`  completed: ${t}`);
      return lines.join("\n");
    })
    .join("\n\n");

  const client = new Anthropic();
  try {
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 6000,
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: SCHEMA as unknown as Record<string, unknown> },
      },
      system:
        "You draft first-pass billing narratives for a litigation attorney from his day's activity ledger. One narrative per matter. Standard defense-billing style: past tense, specific but concise, activities separated by semicolons, ending with a period. Describe only what the ledger supports — never pad, never invent detail, never include time amounts or client names. If an activity is vague, describe it at the level of detail given.",
      messages: [
        {
          role: "user",
          content: `Date: ${date}. Draft one narrative per matter from this ledger. Use each matter's key (the id after "MATTER") as matter_key.\n\n${input}`,
        },
      ],
    });
    if (response.stop_reason === "refusal") {
      return { ok: false, error: "Drafting was declined — try again.", drafts: [] };
    }
    const block = response.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") return { ok: false, error: "No output.", drafts: [] };
    const parsed = JSON.parse(block.text) as {
      narratives: { matter_key: string; narrative: string }[];
    };
    const drafts: NarrativeDraft[] = billable.map((g) => ({
      matterId: g.matterId,
      matterName: g.matterName ?? "Unknown matter",
      totalMinutes: g.totalMinutes,
      narrative:
        parsed.narratives.find((n) => n.matter_key === g.matterId)?.narrative ??
        "(no draft produced — write manually)",
    }));
    return { ok: true, drafts };
  } catch (e) {
    return { ok: false, error: (e as { message?: string }).message ?? "Drafting failed.", drafts: [] };
  }
}

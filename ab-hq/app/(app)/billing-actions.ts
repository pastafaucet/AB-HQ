"use server";

import Anthropic from "@anthropic-ai/sdk";
import { getDayLedgerData } from "@/lib/queries";

// First-draft billing narratives from the day's ledger, grouped by matter.
// Time entry becomes editing rather than remembering: the draft is a starting
// point, always reviewed by Andy before it goes anywhere near a bill.

export interface NarrativeDraft {
  matterId: string | null;
  matterName: string;
  totalMinutes: number; // tracked timer time
  enteredTenths: number; // billed tenths entered on captures
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
              "The billing narrative for this matter's day, in the attorney's house style: terse activity fragments, each ending with its time in tenths in parentheses, separated by semicolons. Example: 'Review redlines from appellate counsel to immunity motion (.4); emails with CoCo re same (.2); review fact sheets from Brown Greer re settlement updates (.4)'. Use the exact time given for each activity; write (.__) when no time was given. Never invent a time.",
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

  const fmtTenths = (t: number) => (t < 10 ? `.${t}` : (t / 10).toFixed(1));
  const input = billable
    .map((g) => {
      const lines: string[] = [`MATTER ${g.matterId} — ${g.matterName}`];
      for (const e of g.entries) {
        const time = e.billedTenths ? ` | time: ${fmtTenths(e.billedTenths)}` : " | time: unknown";
        lines.push(`  activity: ${e.raw}${time}`);
      }
      for (const s of g.sessions) {
        const tenths = Math.max(1, Math.round(s.minutes / 6));
        lines.push(`  tracked work: ${s.taskTitle} | timer ran ${s.minutes}m ≈ ${fmtTenths(tenths)}`);
      }
      for (const t of g.doneTasks) lines.push(`  completed task: ${t} | time: unknown`);
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
      system: `You draft billing narratives for a litigation attorney from his day's activity ledger, in his exact house style. One narrative per matter: terse verb-first activity fragments, each ending with its time in tenths of an hour in parentheses, separated by semicolons. His own example of the style:

"Review redlines from appellate counsel to immunity motion (.4); review new cases cited in motion (.3); emails with CoCo re same (.2); texts with Boris/Todd re Group A/C updates (.2); review fact sheets and settlement updates from Brown Greer re same (.4)"

Rules: keep his shorthand ("re", people's short names) as captured; clean up typos lightly but do not formalize the voice. Use each activity's given time exactly; for tracked work use the ≈ tenths given; when time is unknown write (.__) for him to fill in. Never invent a time or an activity. If an entry and a completed task clearly describe the same work, merge them into one activity. Describe only what the ledger supports — no padding, no client names, no editorializing.`,
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
      enteredTenths: g.totalTenths,
      narrative:
        parsed.narratives.find((n) => n.matter_key === g.matterId)?.narrative ??
        "(no draft produced — write manually)",
    }));
    return { ok: true, drafts };
  } catch (e) {
    return { ok: false, error: (e as { message?: string }).message ?? "Drafting failed.", drafts: [] };
  }
}

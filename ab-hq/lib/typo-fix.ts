import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// Obvious-typo correction for time-entry descriptions, which go on client
// bills. Andy's rule (2026-11-08): correct obvious typos, then tell him what
// changed. Nothing else: no rephrasing, no added words, no new punctuation.
// The model proposes word-level fixes; this code accepts a fix only if it is
// a small edit of a single word that actually appears in the text, so the
// description can't drift even if the model misbehaves.

const SCHEMA = {
  type: "object",
  properties: {
    fixes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          from: { type: "string", description: "The misspelled word exactly as it appears." },
          to: { type: "string", description: "The corrected word." },
        },
        required: ["from", "to"],
        additionalProperties: false,
      },
    },
  },
  required: ["fixes"],
  additionalProperties: false,
} as const;

const SYSTEM = `You proofread billing descriptions for a litigation attorney. List only OBVIOUS spelling typos in ordinary English words (e.g. "plaintffs" -> "plaintiffs", "reivew" -> "review", "teh" -> "the"). Never touch: names of people, firms, courts, places or cases; abbreviations and acronyms (OC, DA, DTLA, re, w/, PMK, MSJ); legal terms of art; numbers; times in parentheses; word choice, grammar, tense or punctuation. If a word might be a name or a term of art, leave it. When in doubt, leave it. Most descriptions need no fixes: return an empty list.`;

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

export interface TypoResult {
  text: string;
  fixes: string[]; // "plaintffs → plaintiffs"
}

/** Correct obvious typos; returns the text unchanged on any doubt or error. */
export async function fixTypos(text: string): Promise<TypoResult> {
  if (!process.env.ANTHROPIC_API_KEY || !text.trim()) return { text, fixes: [] };
  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 1000,
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: SCHEMA as unknown as Record<string, unknown> },
      },
      system: SYSTEM,
      messages: [{ role: "user", content: text }],
    });
    const block = res.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") return { text, fixes: [] };
    const { fixes } = JSON.parse(block.text) as { fixes: { from: string; to: string }[] };
    let out = text;
    const applied: string[] = [];
    for (const f of fixes ?? []) {
      const from = f.from?.trim();
      const to = f.to?.trim();
      // Guardrails: one plain word, really present, a small edit, same capitalization pattern.
      if (!from || !to || from === to) continue;
      if (!/^[A-Za-z][A-Za-z'’-]*$/.test(from) || !/^[A-Za-z][A-Za-z'’-]*$/.test(to)) continue;
      if (from.length < 3 || from === from.toUpperCase()) continue;
      if (editDistance(from.toLowerCase(), to.toLowerCase()) > 2) continue;
      if ((from[0] === from[0].toUpperCase()) !== (to[0] === to[0].toUpperCase())) continue;
      const re = new RegExp(`\\b${from.replace(/[-'’]/g, "\\$&")}\\b`, "g");
      if (!re.test(out)) continue;
      out = out.replace(re, to);
      applied.push(`${from} → ${to}`);
    }
    return { text: out, fixes: applied };
  } catch {
    return { text, fixes: [] };
  }
}

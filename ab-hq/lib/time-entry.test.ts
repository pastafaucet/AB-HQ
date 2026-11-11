// Run: npm run test:time   (node's built-in test runner, no extra deps)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseTimeCapture,
  hasTimeEntry,
  formatHours,
  parseDatePrefix,
  applyAnswers,
  descriptionTimes,
  type ClientRow,
  type AliasRow,
} from "./time-entry.ts";

// A slice of the real Clients tab (2026-11-08).
const clients: ClientRow[] = [
  { name: "Cedars/Tia", billable: true, increment: 0.1, aliases: ["CEdars", "Cedars", "Cedars Tia", "Cedars-Tia"], active: true },
  { name: "Cedars/Huntington", billable: true, increment: 0.1, aliases: [], active: true },
  { name: "COLA/Does", billable: true, increment: 0.1, aliases: ["COLA - DOES", "COLA - Does", "COLA Does"], active: true },
  { name: "COLA/Fight Club 2", billable: true, increment: 0.1, aliases: [], active: true },
  { name: "Fire cases", billable: true, increment: 0.25, aliases: ["Fire Cases", "Glaser Fire", "GW / Fire", "GW Fire"], active: true },
  { name: "RS/General", billable: true, increment: 0.25, aliases: ["RS/Gen", "Ryan/Gen", "Ryan/General"], active: true },
  { name: "GW/Business Dev.", billable: false, increment: 0.25, aliases: [], active: true },
  { name: "COLA/Cole", billable: true, increment: 0.1, aliases: [], active: false },
  { name: "COLA/Cole 1", billable: true, increment: 0.1, aliases: [], active: true },
];
const aliases: AliasRow[] = [
  { typed: "AB 218", canonical: "COLA/Does" },
  { typed: "GW Fire", canonical: "Fire cases" },
  { typed: "GW - Fire", canonical: "Fire cases" },
  { typed: "Morales", canonical: "COLA/Fight Club 2" },
  { typed: "Tia", canonical: "Cedars/Tia" },
  { typed: "RS Gen", canonical: "RS/General" },
  { typed: "Biz dev", canonical: "GW/Business Dev." },
];
const ctx = { today: "2026-11-06", clients, aliases }; // a Friday

const one = (s: string) => parseTimeCapture(s, ctx)[0];

test("AB 218, two tasks: COLA/Does, 0.9, both keep times", () => {
  const e = one("AB 218 - prepare for/attend fund meeting (.7); call with Jason re DA production of final DTLA audit report (.2)");
  assert.equal(e.client, "COLA/Does");
  assert.equal(e.hours, 0.9);
  assert.deepEqual(e.questions, []);
  assert.equal(e.description, "Prepare for/attend fund meeting (.7); call with Jason re DA production of final DTLA audit report (.2)");
});

test("GW fire, one task: Fire cases, 0.75, no parens", () => {
  const e = one("GW fire - Management call with fire team (.75)");
  assert.equal(e.client, "Fire cases");
  assert.equal(e.hours, 0.75);
  assert.deepEqual(e.questions, []);
  assert.equal(e.description, "Management call with fire team");
});

test("times mid-sentence: COLA/Does, 0.7, times kept in place", () => {
  const e = one("AB 218 - prepare for (.2) and call with (.5) Brown Greer re Group A updates");
  assert.equal(e.client, "COLA/Does");
  assert.equal(e.hours, 0.7);
  assert.deepEqual(e.questions, []);
  assert.equal(e.description, "Prepare for (.2) and call with (.5) Brown Greer re Group A updates");
});

test("RS Gen: RS/General, 0.75, no per-task times", () => {
  const e = one("RS Gen - call with Jeff re next steps (.5); follow up emails (.25)");
  assert.equal(e.client, "RS/General");
  assert.equal(e.hours, 0.75);
  assert.deepEqual(e.questions, []);
  assert.equal(e.description, "Call with Jeff re next steps; follow up emails");
});

test("Tia (.25): ask, Cedars/Tia bills in tenths", () => {
  const e = one("Tia - review memo (.25)");
  assert.equal(e.client, "Cedars/Tia");
  assert.equal(e.questions.length, 1);
  assert.equal(e.questions[0].kind, "increment");
  if (e.questions[0].kind === "increment") assert.deepEqual(e.questions[0].options, [0.2, 0.3]);
});

test("Nicole call (4): ask, no matter and a bare integer", () => {
  const e = one("Nicole call (4)");
  const kinds = e.questions.map((q) => q.kind).sort();
  assert.deepEqual(kinds, ["bare-integer", "matter"]);
});

test("detection", () => {
  assert.equal(hasTimeEntry("call with OC (.4)"), true);
  assert.equal(hasTimeEntry("review (1.3)"), true);
  assert.equal(hasTimeEntry("hearing Theberge 10/30 at 9:30"), false);
  assert.equal(hasTimeEntry("oppo due friday p1"), false);
});

test("formatHours matches the sheet's style", () => {
  assert.equal(formatHours(0.4), ".4");
  assert.equal(formatHours(0.75), ".75");
  assert.equal(formatHours(1.3), "1.3");
  assert.equal(formatHours(1), "1.0");
});

test("dates", () => {
  assert.equal(parseDatePrefix("yesterday AB 218 - x (.2)", "2026-11-06").date, "2026-11-05");
  assert.equal(parseDatePrefix("last Wed - AB 218 - x (.2)", "2026-11-06").date, "2026-11-04");
  assert.equal(parseDatePrefix("10/1 AB 218 - x (.2)", "2026-11-06").date, "2026-10-01");
  assert.equal(parseDatePrefix("Fri 10/30 AB 218 - x (.2)", "2026-11-06").date, "2026-10-30");
  assert.equal(parseDatePrefix("Thu 10/30 AB 218 - x (.2)", "2026-11-06").question?.kind, "date"); // 10/30 was a Friday
  assert.equal(parseDatePrefix("12/1 AB 218 - x (.2)", "2026-11-06").question?.kind, "date"); // future
});

test("multiple lines become multiple entries", () => {
  const es = parseTimeCapture("AB 218 - review (.2)\nGW fire - call (.25)", ctx);
  assert.equal(es.length, 2);
  assert.equal(es[1].client, "Fire cases");
});

test("stated total that disagrees: ask", () => {
  const e = one("AB 218 - review (.2); call (.3) (1.0 total)");
  assert.ok(e.questions.some((q) => q.kind === "total-mismatch"));
});

test("matter with a dash in it (GW - Fire)", () => {
  const e = one("GW - Fire - call with team (.5)");
  assert.equal(e.client, "Fire cases");
  assert.equal(e.description, "Call with team");
});

test("after the slash; Active preferred", () => {
  assert.equal(one("Huntington - review (.3)").client, "Cedars/Huntington");
});

test("a second task with no time: ask", () => {
  const e = one("AB 218 - review (.2); email Tim");
  assert.ok(e.questions.some((q) => q.kind === "missing-time"));
});

test("answering the bare integer clears the question", () => {
  const e = one("AB 218 - prep (4)");
  const fixed = applyAnswers(e, { bareIntegers: [0.4] }, ctx);
  assert.equal(fixed.hours, 0.4);
  assert.deepEqual(fixed.questions, []);
});

test("a date on its own line carries to the lines below (11/7 regression)", () => {
  const es = parseTimeCapture(
    "11/4\n\nAb 218 - call with Nicole re fraud report (.3)\n\nBiz dev - dinner with Tim Hall (2.25)\n10/30 AB 218 - review (.2)",
    ctx
  );
  assert.equal(es.length, 3);
  assert.equal(es[0].date, "2026-11-04");
  assert.equal(es[1].date, "2026-11-04");
  assert.equal(es[1].client, "GW/Business Dev.");
  assert.equal(es[2].date, "2026-10-30"); // its own date wins
  assert.ok(es.every((e) => !e.questions.some((q) => q.kind === "matter")));
});

test("a matter at the start without a dash", () => {
  const e = one("11/3 Cedars/Huntington emails from Elspeth re dispute notice (.1); draft dispute notice (.6)");
  assert.equal(e.client, "Cedars/Huntington");
  assert.equal(e.date, "2026-11-03");
  assert.equal(e.description, "Emails from Elspeth re dispute notice (.1); draft dispute notice (.6)");
});

test("no dash and no known matter at the start: still asks", () => {
  const e = one("Nicole call re strategy (.3)");
  assert.ok(e.questions.some((q) => q.kind === "matter"));
});

test("descriptionTimes reads times the way the sheet's Check column does", () => {
  const t = descriptionTimes("Emails (.1); draft notice (.6); call (1.0); review (2)");
  assert.equal(t.sum, 1.7);
  assert.equal(t.count, 3);
  assert.deepEqual(t.bareIntegers, ["(2)"]);
  assert.equal(descriptionTimes("Management call with fire team").count, 0);
});

// ---- date headers (2026-11-11) ----
// ctx.today is Fri 2026-11-06 in these tests; headers use earlier dates.

test('"please add for 11/6:" is a header for the line below', () => {
  const es = parseTimeCapture("please add for 11/6:\nCOLA/Does - call with X (.5)", { ...ctx, today: "2026-11-09" });
  assert.equal(es.length, 1);
  assert.equal(es[0].date, "2026-11-06");
  assert.equal(es[0].client, "COLA/Does");
});

test('"For Thursday 11/5:" applies to every line below', () => {
  const es = parseTimeCapture("For Thursday 11/5:\nAB 218 - task (.2)\nTia - task (.1)", ctx);
  assert.equal(es.length, 2);
  assert.deepEqual(es.map((e) => e.date), ["2026-11-05", "2026-11-05"]);
  assert.ok(es.every((e) => !e.questions.some((q) => q.kind === "date")));
});

test("a date at the start of an entry line applies to that line only", () => {
  const es = parseTimeCapture("11/5 COLA/Does - task (.2)\nTia - task (.1)", ctx);
  assert.deepEqual(es.map((e) => e.date), ["2026-11-05", "2026-11-06"]);
});

test("a later header replaces the earlier one", () => {
  const es = parseTimeCapture("11/3\nAB 218 - a (.2)\nyesterday:\nTia - b (.1)", ctx);
  assert.deepEqual(es.map((e) => e.date), ["2026-11-03", "2026-11-05"]);
});

test("an entry that forgot its time is not mistaken for a header", () => {
  const es = parseTimeCapture("Tia - review memo 11/2\nAB 218 - call (.2)", ctx);
  assert.equal(es.length, 2);
  assert.equal(es[1].date, "2026-11-06"); // no header carried
});

test("a header whose weekday doesn't match its date asks", () => {
  const [e] = parseTimeCapture("For Wednesday 11/5:\nAB 218 - task (.2)", ctx);
  assert.ok(e.questions.some((q) => q.kind === "date"));
});

// ---- capitals after "; " ----

test('a stray capital at the start of a later task is lowercased', () => {
  const e = one("AB 218 - review memo (.2); Call with Jonathan re strategy (.3); Emails with CoCo (.1)");
  assert.equal(e.description, "Review memo (.2); call with Jonathan re strategy (.3); emails with CoCo (.1)");
});

test("names and acronyms after \"; \" keep their capitals", () => {
  const e = one("AB 218 - review memo (.2); Brown Greer call (.3); DA production review (.1)");
  assert.equal(e.description, "Review memo (.2); Brown Greer call (.3); DA production review (.1)");
});

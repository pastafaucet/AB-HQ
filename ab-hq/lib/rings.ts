import "server-only";
import { getSupabase } from "@/lib/supabase";
import { selectTaskRows, todayISO } from "@/lib/task-map";
import { inScope, type Scope } from "@/lib/scope";
import { getBillableByDay } from "@/lib/hours-sheet";
import { billableRing, periodOf, tasksRing, type Ring } from "@/lib/progress";

/** HQ's rings: Tasks and Billable, this week and this month. */
export async function getRings(scope: Scope = "all"): Promise<Ring[]> {
  const today = todayISO();
  const week = periodOf("week", today);
  const month = periodOf("month", today);
  // A week can start in the previous month or end in the next.
  const from = week.start < month.start ? week.start : month.start;
  const to = week.end > month.end ? week.end : month.end;

  const showHours = scope !== "personal"; // billable time is work
  const [rows, byDay] = await Promise.all([
    selectTaskRows((cols) =>
      getSupabase().from("tasks").select(cols).gte("do_date", from).lte("do_date", to)
    ).catch(() => []),
    showHours ? getBillableByDay(from, to).catch(() => null) : Promise.resolve(null),
  ]);
  const tasks = inScope(rows, scope).map((r) => ({
    type: r.type as string,
    status: r.status as string,
    doDate: r.do_date,
  }));

  return showHours
    ? [tasksRing(week, tasks, today), billableRing(week, byDay, today), tasksRing(month, tasks, today), billableRing(month, byDay, today)]
    : [tasksRing(week, tasks, today), tasksRing(month, tasks, today)];
}

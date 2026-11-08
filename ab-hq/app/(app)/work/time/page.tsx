import TimeClient from "@/app/components/TimeClient";
import { todayISO } from "@/lib/task-map";
import { getHoursToday, loadClients, type HoursToday } from "@/lib/hours-sheet";
import { sheetsConfigured } from "@/lib/google-sheets";
import { loadPendingTime, type PendingItem } from "@/app/(app)/hours-actions";

export const metadata = { title: "Time · AB HQ" };
export const dynamic = "force-dynamic";

export default async function TimePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; month?: string }>;
}) {
  const { date, month } = await searchParams;
  const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayISO();
  const shown = month && /^\d{4}-\d{2}$/.test(month) ? month : day.slice(0, 7);
  let hours: HoursToday | null = null;
  let hoursError: string | null = null;
  let clients: { name: string; increment: number }[] = [];
  let pending: PendingItem[] = [];
  if (!sheetsConfigured()) hoursError = "The hours sheet isn't connected yet.";
  else {
    try {
      const [h, c, p] = await Promise.all([getHoursToday(day, shown), loadClients(), loadPendingTime()]);
      pending = p;
      hours = h;
      clients = c.filter((x) => x.active).map((x) => ({ name: x.name, increment: x.increment }));
    } catch (e) {
      hoursError = e instanceof Error ? e.message : "Couldn't read the hours sheet.";
    }
  }
  return (
    <TimeClient date={day} month={shown} hours={hours} hoursError={hoursError} clients={clients} pending={pending} />
  );
}

import TimeClient from "@/app/components/TimeClient";
import { todayISO } from "@/lib/task-map";
import { getHoursToday, type HoursToday } from "@/lib/hours-sheet";
import { sheetsConfigured } from "@/lib/google-sheets";

export const metadata = { title: "Time · AB HQ" };
export const dynamic = "force-dynamic";

export default async function TimePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date } = await searchParams;
  const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayISO();
  let hours: HoursToday | null = null;
  let hoursError: string | null = null;
  if (!sheetsConfigured()) hoursError = "The hours sheet isn't connected yet.";
  else {
    try {
      hours = await getHoursToday(day);
    } catch (e) {
      hoursError = e instanceof Error ? e.message : "Couldn't read the hours sheet.";
    }
  }
  return <TimeClient date={day} hours={hours} hoursError={hoursError} />;
}

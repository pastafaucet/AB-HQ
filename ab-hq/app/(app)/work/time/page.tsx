import TimeClient from "@/app/components/TimeClient";
import { getDayLedgerData } from "@/lib/queries";
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
  // The hours sheet is the record; read it alongside the capture ledger.
  let hours: HoursToday | null = null;
  let hoursError: string | null = null;
  if (!sheetsConfigured()) hoursError = "The hours sheet isn't connected yet.";
  const [data] = await Promise.all([
    getDayLedgerData(day),
    sheetsConfigured()
      ? getHoursToday(day)
          .then((h) => (hours = h))
          .catch((e) => (hoursError = e instanceof Error ? e.message : "Couldn't read the hours sheet."))
      : null,
  ]);
  return <TimeClient data={data} hours={hours} hoursError={hoursError} />;
}

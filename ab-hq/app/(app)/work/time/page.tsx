import TimeClient from "@/app/components/TimeClient";
import { getDayLedgerData } from "@/lib/queries";
import { todayISO } from "@/lib/task-map";

export const metadata = { title: "Day Ledger · AB HQ" };
export const dynamic = "force-dynamic";

export default async function TimePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date } = await searchParams;
  const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayISO();
  const data = await getDayLedgerData(day);
  return <TimeClient data={data} />;
}

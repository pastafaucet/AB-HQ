import WeeklyClient from "@/app/components/WeeklyClient";
import { getWeeklyReviewData } from "@/lib/queries";

export const metadata = { title: "Weekly Review · AB HQ" };
export const dynamic = "force-dynamic";

export default async function WeeklyPage() {
  const data = await getWeeklyReviewData();
  return <WeeklyClient data={data} />;
}

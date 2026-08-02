import MyDayClient from "@/app/components/MyDayClient";
import { getMyDayData } from "@/lib/queries";

export const metadata = { title: "My Day · AB HQ" };
export const dynamic = "force-dynamic";

export default async function MyDayPage() {
  const { tasks, matters, today, running } = await getMyDayData();
  const dateLabel = new Date(`${today}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <MyDayClient
      initialTasks={tasks}
      matters={matters}
      today={today}
      dateLabel={dateLabel}
      initialRunning={running}
    />
  );
}

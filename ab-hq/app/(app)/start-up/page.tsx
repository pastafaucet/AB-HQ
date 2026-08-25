import StartUpClient from "@/app/components/StartUpClient";
import { getStartUpData } from "@/lib/queries";

export const metadata = { title: "Start of Day · AB HQ" };
export const dynamic = "force-dynamic";

export default async function StartUpPage() {
  const { tasks, matters, projects, today, intention, onTapFromYesterday, running } =
    await getStartUpData();
  const dateLabel = new Date(`${today}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  return (
    <StartUpClient
      initialTasks={tasks}
      matters={matters}
      projects={projects}
      today={today}
      dateLabel={dateLabel}
      initialIntention={intention}
      onTapFromYesterday={onTapFromYesterday}
      initialRunning={running}
    />
  );
}

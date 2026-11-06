import MyDayClient from "@/app/components/MyDayClient";
import { getMyDayData } from "@/lib/queries";
import type { Scope } from "@/lib/scope";

export default async function TodayMode({ scope }: { scope: Scope }) {
  const { tasks, matters, projects, today, running, logged } = await getMyDayData(scope);
  const dateLabel = new Date(`${today}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <MyDayClient
      key={scope}
      initialTasks={tasks}
      matters={matters}
      projects={projects}
      today={today}
      dateLabel={dateLabel}
      initialRunning={running}
      initialLogged={logged}
    />
  );
}

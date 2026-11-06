import StartUpClient from "@/app/components/StartUpClient";
import { getStartUpData } from "@/lib/queries";
import type { Scope } from "@/lib/scope";

export default async function StartMode({ scope }: { scope: Scope }) {
  const { tasks, matters, projects, today, intention, onTapFromYesterday, running, life } =
    await getStartUpData(scope);
  const dateLabel = new Date(`${today}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  return (
    <StartUpClient
      key={scope}
      initialTasks={tasks}
      matters={matters}
      projects={projects}
      today={today}
      dateLabel={dateLabel}
      initialIntention={intention}
      onTapFromYesterday={onTapFromYesterday}
      initialRunning={running}
      life={life}
    />
  );
}

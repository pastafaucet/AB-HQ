import TasksClient from "@/app/components/TasksClient";
import { getTasksPageData } from "@/lib/queries";

export const metadata = { title: "Tasks · AB HQ" };
export const dynamic = "force-dynamic";

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ matter?: string }>;
}) {
  const [{ tasks, matters, projects, today, running }, { matter }] = await Promise.all([
    getTasksPageData(),
    searchParams,
  ]);
  return (
    <TasksClient
      initialTasks={tasks}
      matters={matters}
      projects={projects}
      today={today}
      initialRunning={running}
      initialMatterId={matter ?? null}
    />
  );
}

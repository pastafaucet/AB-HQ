import TasksClient from "@/app/components/TasksClient";
import { getTasksPageData } from "@/lib/queries";

export const metadata = { title: "Tasks · AB HQ" };
export const dynamic = "force-dynamic";

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ matter?: string }>;
}) {
  const [{ tasks, matters, today, running }, { matter }] = await Promise.all([
    getTasksPageData(),
    searchParams,
  ]);
  return (
    <TasksClient
      initialTasks={tasks}
      matters={matters}
      today={today}
      initialRunning={running}
      initialMatterId={matter ?? null}
    />
  );
}

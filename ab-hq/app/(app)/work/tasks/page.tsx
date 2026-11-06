import TasksClient from "@/app/components/TasksClient";
import { getTasksPageData } from "@/lib/queries";
import { getScope } from "@/lib/scope-server";

export const metadata = { title: "Tasks · AB HQ" };
export const dynamic = "force-dynamic";

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ matter?: string }>;
}) {
  const scope = await getScope();
  const [{ tasks, matters, projects, today, running }, { matter }] = await Promise.all([
    getTasksPageData(scope),
    searchParams,
  ]);
  return (
    <TasksClient
      key={scope}
      initialTasks={tasks}
      matters={matters}
      projects={projects}
      today={today}
      initialRunning={running}
      initialMatterId={matter ?? null}
    />
  );
}

import TasksClient from "@/app/components/TasksClient";
import { getTasksPageData } from "@/lib/queries";

export const metadata = { title: "Tasks · AB HQ" };
export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const { tasks, matters, today, running } = await getTasksPageData();
  return (
    <TasksClient
      initialTasks={tasks}
      matters={matters}
      today={today}
      initialRunning={running}
    />
  );
}

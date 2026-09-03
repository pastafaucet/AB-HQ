import CommandCenterClient from "@/app/components/CommandCenterClient";
import { getCommandCenterData } from "@/lib/queries";

export const metadata = { title: "Andy's HQ" };
export const dynamic = "force-dynamic";

export default async function CommandCenterPage() {
  const data = await getCommandCenterData();
  const dateLabel = new Date(`${data.today}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  return <CommandCenterClient data={data} dateLabel={dateLabel} />;
}

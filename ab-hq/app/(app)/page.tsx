import CommandCenterClient from "@/app/components/CommandCenterClient";
import { getCommandCenterData } from "@/lib/queries";
import { getScope } from "@/lib/scope-server";
import { getRings } from "@/lib/rings";

export const metadata = { title: "Andy's HQ" };
export const dynamic = "force-dynamic";

export default async function CommandCenterPage() {
  const scope = await getScope();
  const [data, rings] = await Promise.all([getCommandCenterData(scope), getRings(scope)]);
  const dateLabel = new Date(`${data.today}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  return <CommandCenterClient key={scope} data={data} rings={rings} dateLabel={dateLabel} />;
}

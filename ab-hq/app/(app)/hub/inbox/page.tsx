import InboxClient from "@/app/components/InboxClient";
import { getInboxData } from "@/lib/queries";

export const metadata = { title: "Quick Drop · AB HQ" };
export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const { entries, matters, projects, today, needsMigration } = await getInboxData();
  return (
    <InboxClient
      entries={entries}
      matters={matters}
      projects={projects}
      today={today}
      needsMigration={needsMigration}
    />
  );
}

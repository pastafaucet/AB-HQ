import NotesClient from "@/app/components/NotesClient";
import { getNotesPageData } from "@/lib/queries";

export const metadata = { title: "Notes · AB HQ" };
export const dynamic = "force-dynamic";

export default async function NotesPage({
  searchParams,
}: {
  searchParams: Promise<{ note?: string }>;
}) {
  const [data, { note }] = await Promise.all([getNotesPageData(), searchParams]);
  return <NotesClient initial={data} initialSelectedId={note ?? null} />;
}

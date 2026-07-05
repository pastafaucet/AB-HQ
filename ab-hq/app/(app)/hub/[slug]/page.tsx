import Placeholder from "@/app/components/Placeholder";
import { findNavItem } from "@/lib/nav";

export default async function HubPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const item = findNavItem(`/hub/${slug}`);
  const title = item?.label ?? "Hub";
  const code = item?.code ?? "··";

  const note =
    slug === "health"
      ? "The Health hub will aggregate training, sleep, nutrition, and appointments. Sections aren't built yet."
      : "This hub reuses the same patterns as the daily surfaces. It's a placeholder in V1 — the Start of Day → Today → Wind Down loop comes first.";

  return <Placeholder code={code} title={title} note={note} />;
}

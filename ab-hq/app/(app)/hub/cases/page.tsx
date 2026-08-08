import CasesClient from "@/app/components/CasesClient";
import { getCasesPageData } from "@/lib/queries";

export const metadata = { title: "Cases · AB HQ" };
export const dynamic = "force-dynamic";

export default async function CasesPage() {
  const { cases, today } = await getCasesPageData();
  return <CasesClient cases={cases} today={today} />;
}

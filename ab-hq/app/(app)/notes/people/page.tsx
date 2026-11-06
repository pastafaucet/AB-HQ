import PeopleClient from "@/app/components/PeopleClient";
import { getPeoplePageData } from "@/lib/queries";

export const metadata = { title: "People · AB HQ" };
export const dynamic = "force-dynamic";

export default async function PeoplePage() {
  const { people, matters } = await getPeoplePageData();
  return <PeopleClient people={people} matters={matters} />;
}

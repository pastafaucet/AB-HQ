import ProjectsClient from "@/app/components/ProjectsClient";
import { getProjectsPageData } from "@/lib/queries";

export const metadata = { title: "Projects · AB HQ" };
export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const { projects, matters, today } = await getProjectsPageData();
  return <ProjectsClient projects={projects} matters={matters} today={today} />;
}

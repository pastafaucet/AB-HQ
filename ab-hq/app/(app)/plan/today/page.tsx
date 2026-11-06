import { cookies } from "next/headers";
import TodayModeSwitch from "@/app/components/TodayModeSwitch";
import { resolveTodayMode, pacificNow, TODAY_MODE_COOKIE, TODAY_MODES } from "@/lib/today-mode";
import { getScope } from "@/lib/scope-server";
import StartMode from "./start-mode";
import TodayMode from "./today-mode";
import WindMode from "./wind-mode";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const { mode } = await searchParams;
  const label = TODAY_MODES.find((m) => m.key === mode)?.label ?? "Today";
  return { title: `${label} · AB HQ` };
}

// Plan → Today. One page, three modes: Start of Day, Today, Wind Down.
export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const [{ mode: param }, jar, scope] = await Promise.all([searchParams, cookies(), getScope()]);
  const { date, hour } = pacificNow();
  const mode = resolveTodayMode(param, jar.get(TODAY_MODE_COOKIE)?.value, date, hour);

  return (
    <div className="page-col">
      <TodayModeSwitch mode={mode} />
      <div className="page-row">
        {mode === "start" && <StartMode scope={scope} />}
        {mode === "today" && <TodayMode scope={scope} />}
        {mode === "wind" && <WindMode scope={scope} />}
      </div>
    </div>
  );
}

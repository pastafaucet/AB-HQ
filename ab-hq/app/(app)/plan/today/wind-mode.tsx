import WindDownClient from "@/app/components/WindDownClient";
import { getWindDownData } from "@/lib/queries";
import type { Scope } from "@/lib/scope";

export default async function WindMode({ scope }: { scope: Scope }) {
  const data = await getWindDownData(scope);
  const dateLabel = new Date(`${data.today}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <WindDownClient
      key={scope}
      today={data.today}
      tomorrow={data.tomorrow}
      dateLabel={dateLabel}
      doneToday={data.doneToday}
      mits={data.mits}
      candidates={data.candidates}
      inboxEntries={data.inboxEntries}
      capturedToday={data.capturedToday}
      tenthsToday={data.tenthsToday}
      matters={data.matters}
      matterOptions={data.matterOptions}
      projects={data.projects}
      onTapForTomorrow={data.onTapForTomorrow}
      reflection={data.reflection}
      entriesReady={data.entriesReady}
      life={data.life}
      initialRunning={data.running}
      mediaTitles={data.mediaTitles}
    />
  );
}

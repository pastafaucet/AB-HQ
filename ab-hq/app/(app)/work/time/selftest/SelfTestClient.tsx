"use client";

import { useState, useTransition } from "react";
import { runHoursSelfTest, type SelfTestStep } from "@/app/(app)/hours-selftest-actions";

export default function SelfTestClient() {
  const [steps, setSteps] = useState<SelfTestStep[] | null>(null);
  const [busy, start] = useTransition();
  return (
    <section className="pane">
      <div className="kicker">TIME · TEST COPY ONLY</div>
      <h1 className="display-h1">Hours sheet self-test</h1>
      <p className="empty-note">
        Writes three &ldquo;ZZ AB HQ self-test&rdquo; entries to the test copy (append, merge, insert into an earlier
        day), then undoes each. It refuses to run against the live sheet.
      </p>
      <button type="button" className="tc-primary" disabled={busy} onClick={() => start(async () => setSteps(await runHoursSelfTest()))}>
        {busy ? "Running…" : "Run the self-test"}
      </button>
      {steps && (
        <div style={{ marginTop: 18 }}>
          {steps.map((s, i) => (
            <div key={i} className="hs-row">
              <div className="hs-row-top">
                <span className="hs-client">
                  {s.ok ? "✓" : "✗"} {s.step}
                </span>
              </div>
              <div className={s.ok ? "tc-note" : "tc-error"} style={{ marginLeft: 0 }}>
                {s.detail}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

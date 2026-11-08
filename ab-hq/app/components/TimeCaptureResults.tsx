"use client";

import { useState, useTransition } from "react";
import {
  addHoursClient,
  confirmTimeEntry,
  undoTimeEntry,
  type LoggedItem,
  type PendingItem,
  type TimeCaptureResult,
} from "@/app/(app)/hours-actions";
import { formatHours, toSheetDate } from "@/lib/time-entry";

/** What a time-entry capture did: logged lines (with Undo) and cards to confirm. */
export default function TimeCaptureResults({ result }: { result: TimeCaptureResult }) {
  const [logged, setLogged] = useState<LoggedItem[]>(result.logged);
  const [pending, setPending] = useState<PendingItem[]>(result.pending);
  return (
    <div className="tc-results">
      {logged.map((l, i) => (
        <LoggedLine key={`${l.logId}-${i}`} item={l} />
      ))}
      {pending.map((p, i) => (
        <TimeEntryCard
          key={`${p.entry.line}-${i}`}
          item={p}
          clientNames={result.clientNames}
          onDone={(item) => {
            setPending((prev) => prev.filter((_, j) => j !== i));
            if (item) setLogged((prev) => [...prev, item]);
          }}
        />
      ))}
      {result.errors.map((e, i) => (
        <div key={i} className="tc-error">
          {e}
        </div>
      ))}
    </div>
  );
}

function LoggedLine({ item }: { item: LoggedItem }) {
  const [state, setState] = useState<"logged" | "undoing" | "undone">("logged");
  const [msg, setMsg] = useState<string | null>(null);
  const [, start] = useTransition();
  return (
    <div className={`tc-logged${state === "undone" ? " is-undone" : ""}`}>
      <div className="tc-logged-line">
        <span className="tc-check">✓</span>
        <span className="tc-msg">{item.message}</span>
        {item.logId && state !== "undone" && (
          <button
            type="button"
            className="tc-undo"
            disabled={state === "undoing"}
            onClick={() => {
              setState("undoing");
              start(async () => {
                const r = await undoTimeEntry(item.logId!);
                setMsg(r.message);
                setState(r.ok ? "undone" : "logged");
              });
            }}
          >
            {state === "undoing" ? "…" : "Undo"}
          </button>
        )}
      </div>
      {item.flag && <div className="tc-flag">Sheet check: {item.flag}</div>}
      {item.notes.map((n, i) => (
        <div key={i} className="tc-note">
          {n}
        </div>
      ))}
      {msg && <div className="tc-note">{msg}</div>}
    </div>
  );
}

function TimeEntryCard({
  item,
  clientNames,
  onDone,
}: {
  item: PendingItem;
  clientNames: string[];
  onDone: (logged: LoggedItem | null) => void;
}) {
  const e = item.entry;
  const matterQ = e.questions.find((q) => q.kind === "matter");
  const bareQs = e.questions.filter((q) => q.kind === "bare-integer");
  const incQ = e.questions.find((q) => q.kind === "increment");
  const [client, setClient] = useState(e.client ?? (matterQ && matterQ.kind === "matter" ? matterQ.options[0] ?? "" : ""));
  const [saveAlias, setSaveAlias] = useState(!!e.typedMatter && !e.client);
  const [date, setDate] = useState(e.date);
  const [hours, setHours] = useState<string>(e.hours != null ? String(e.hours) : "");
  const [bare, setBare] = useState<(number | null)[]>(bareQs.map(() => null));
  const [description, setDescription] = useState(e.description);
  const [questions, setQuestions] = useState(item.questions);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [added, setAdded] = useState<string[]>([]); // matters added to the Clients tab from this card
  const known = (n: string) => clientNames.includes(n) || added.includes(n);
  const [newClient, setNewClient] = useState<{ open: boolean; billable: boolean; inc: number }>({
    open: false,
    billable: true,
    inc: 0.1,
  });
  const [, start] = useTransition();

  function confirm() {
    setBusy(true);
    setError(null);
    start(async () => {
      const r = await confirmTimeEntry(e, {
        client: client || undefined,
        date,
        hours: hours ? Number(hours) : undefined,
        bareIntegers: bare.every((b) => b !== null) && bare.length ? (bare as number[]) : undefined,
        description: description !== e.description ? description : undefined,
        saveAliasAs: saveAlias && e.typedMatter && client ? e.typedMatter : undefined,
      });
      setBusy(false);
      if (r.error) setError(r.error);
      else if (r.pending) {
        setQuestions(r.pending.questions);
        if (r.pending.entry.hours != null) setHours(String(r.pending.entry.hours));
      } else if (r.logged) onDone(r.logged);
    });
  }

  function createClient() {
    if (!client.trim()) return;
    setBusy(true);
    start(async () => {
      const r = await addHoursClient(client.trim(), newClient.billable, newClient.inc);
      setBusy(false);
      if (r.ok) {
        setAdded((a) => [...a, client.trim()]);
        setNotice(
          `Added "${client.trim()}" to the Clients tab (${newClient.billable ? "Billable" : "Non-billable"}, ${newClient.inc === 0.25 ? "quarters" : "tenths"}). Now log it.`
        );
        setNewClient((n) => ({ ...n, open: false }));
        setQuestions((qs) => qs.filter((q) => !q.toLowerCase().includes("matter")));
      }
      else setError(r.error ?? "Couldn't add the client.");
    });
  }

  return (
    <div className="tc-card">
      <div className="tc-card-line">{e.line}</div>
      {questions.map((q, i) => (
        <div key={i} className="tc-question">
          {q}
        </div>
      ))}

      <div className="tc-grid">
        <label>
          <span>Matter</span>
          <input list="tc-clients" value={client} onChange={(ev) => setClient(ev.target.value)} placeholder="Client/Matter" />
          <datalist id="tc-clients">
            {(matterQ && matterQ.kind === "matter" ? matterQ.options : []).concat(clientNames).map((n, i) => (
              <option key={`${n}-${i}`} value={n} />
            ))}
          </datalist>
        </label>
        <label>
          <span>Date</span>
          <input type="date" value={date} onChange={(ev) => setDate(ev.target.value)} />
        </label>
        <label>
          <span>Hours</span>
          <input
            type="number"
            step="0.05"
            min="0"
            value={hours}
            onChange={(ev) => setHours(ev.target.value)}
          />
        </label>
      </div>

      {bareQs.map((q, i) =>
        q.kind === "bare-integer" ? (
          <div key={i} className="tc-choices">
            <span>({q.value}) means</span>
            {[q.value, q.value / 10].map((v) => (
              <button
                key={v}
                type="button"
                data-on={bare[i] === v}
                onClick={() => {
                  setBare((prev) => prev.map((b, j) => (j === i ? v : b)));
                  setHours("");
                }}
              >
                {formatHours(v)} h
              </button>
            ))}
          </div>
        ) : null
      )}
      {incQ && incQ.kind === "increment" && (
        <div className="tc-choices">
          <span>Use</span>
          {incQ.options.map((v) => (
            <button key={v} type="button" data-on={Number(hours) === v} onClick={() => setHours(String(v))}>
              {formatHours(v)}
            </button>
          ))}
        </div>
      )}

      <label className="tc-desc">
        <span>Description (goes on the bill)</span>
        <textarea rows={2} value={description} onChange={(ev) => setDescription(ev.target.value)} />
      </label>
      {e.fixes.length > 0 && <div className="tc-note">Capitals fixed: {e.fixes.join(", ")}</div>}

      {e.typedMatter && !e.client && client && (
        <label className="tc-check-row">
          <input type="checkbox" checked={saveAlias} onChange={(ev) => setSaveAlias(ev.target.checked)} />
          Remember &ldquo;{e.typedMatter}&rdquo; as {client}
        </label>
      )}

      {newClient.open ? (
        <div className="tc-newclient">
          <span>Add &ldquo;{client || "…"}&rdquo; to the Clients tab as</span>
          <button type="button" data-on={newClient.billable} onClick={() => setNewClient((n) => ({ ...n, billable: true }))}>
            Billable
          </button>
          <button type="button" data-on={!newClient.billable} onClick={() => setNewClient((n) => ({ ...n, billable: false }))}>
            Non-billable
          </button>
          <button type="button" data-on={newClient.inc === 0.1} onClick={() => setNewClient((n) => ({ ...n, inc: 0.1 }))}>
            tenths
          </button>
          <button type="button" data-on={newClient.inc === 0.25} onClick={() => setNewClient((n) => ({ ...n, inc: 0.25 }))}>
            quarters
          </button>
          <button type="button" className="tc-primary" disabled={busy || !client.trim()} onClick={createClient}>
            Add client
          </button>
        </div>
      ) : (
        !known(client.trim()) &&
        client.trim() && (
          <button type="button" className="tc-link" onClick={() => setNewClient((n) => ({ ...n, open: true }))}>
            ＋ &ldquo;{client}&rdquo; is a new matter
          </button>
        )
      )}

      {notice && <div className="tc-note" style={{ marginLeft: 0 }}>{notice}</div>}
      {error && <div className="tc-error">{error}</div>}
      <div className="tc-actions">
        <span className="tc-preview">
          {toSheetDate(date)} · {client || "?"} · {hours ? formatHours(Number(hours)) : "?"}
        </span>
        <button type="button" className="tc-secondary" onClick={() => onDone(null)} disabled={busy}>
          Skip
        </button>
        <button type="button" className="tc-primary" onClick={confirm} disabled={busy}>
          {busy ? "Writing…" : "Log it"}
        </button>
      </div>
    </div>
  );
}

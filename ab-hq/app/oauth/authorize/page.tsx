import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { validateAuthorize } from "@/lib/oauth";
import { originFromHeaders } from "@/lib/oauth-metadata";

export const metadata = { title: "Connect · AB HQ" };

// The consent screen for Claude's connector. The middleware has already
// required the passcode, so reaching this page means Andy is signed in.

const FORWARDED = [
  "client_id",
  "redirect_uri",
  "response_type",
  "code_challenge",
  "code_challenge_method",
  "scope",
  "resource",
  "state",
];

export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const k of FORWARDED) {
    const v = raw[k];
    if (typeof v === "string") params.set(k, v);
  }
  const origin = originFromHeaders(await headers());
  const check = await validateAuthorize(params, origin);

  if (!check.ok) {
    if (check.redirectable) {
      const to = new URL(params.get("redirect_uri")!);
      to.searchParams.set("error", check.error);
      if (params.get("state")) to.searchParams.set("state", params.get("state")!);
      redirect(to.toString());
    }
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-brand">Andy&rsquo;s HQ</div>
          <div className="auth-kicker">CONNECTION REFUSED</div>
          <div className="auth-error">{check.error}</div>
          <div className="auth-note">Start the connection again from Claude.</div>
        </div>
      </div>
    );
  }

  const { req, clientName } = check;
  const destination = new URL(req.redirectUri).host;

  return (
    <div className="auth-screen">
      <form className="auth-card" method="post" action="/oauth/authorize/approve">
        <div className="auth-brand">Andy&rsquo;s HQ</div>
        <div className="auth-kicker">CONNECT AN APP</div>
        <p className="auth-consent">
          <strong>{clientName}</strong>{" "}wants to use your AB HQ: read today&rsquo;s plan, tasks, cases, and notes,
          and add or update tasks, captures, and meeting notes. Claude asks you before each change.
        </p>
        <p className="auth-consent-meta">Signs in through {destination}</p>
        {FORWARDED.map((k) =>
          params.get(k) !== null ? <input key={k} type="hidden" name={k} value={params.get(k)!} /> : null
        )}
        <button className="auth-submit" type="submit" name="decision" value="approve">
          Allow →
        </button>
        <button className="auth-cancel" type="submit" name="decision" value="deny">
          Cancel
        </button>
      </form>
    </div>
  );
}

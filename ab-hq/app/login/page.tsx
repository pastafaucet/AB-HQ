import { login } from "@/app/auth-actions";

export const metadata = { title: "Sign in · AB HQ" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const message =
    error === "config"
      ? "Sign-in isn't configured yet (missing APP_PASSWORD / SESSION_SECRET)."
      : error
        ? "That passcode didn't match. Try again."
        : null;

  return (
    <div className="auth-screen">
      <form className="auth-card" action={login}>
        <div className="auth-brand">Andy&rsquo;s HQ</div>
        <div className="auth-kicker">PERSONAL OPERATING SYSTEM</div>

        <input
          className="auth-input"
          type="password"
          name="password"
          placeholder="Passcode"
          autoFocus
          autoComplete="current-password"
          aria-label="Passcode"
        />

        {message && <div className="auth-error">{message}</div>}

        <button className="auth-submit" type="submit">
          Sign in →
        </button>

        <div className="auth-note">This is a private, single-user workspace.</div>
      </form>
    </div>
  );
}

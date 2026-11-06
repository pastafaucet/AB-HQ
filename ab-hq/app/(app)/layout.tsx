import AppShell from "@/app/components/AppShell";
import { getScope } from "@/lib/scope-server";

// Everything under this route group renders inside the app chrome and is
// protected by the auth middleware. /login lives outside it.
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <AppShell initialScope={await getScope()}>{children}</AppShell>;
}

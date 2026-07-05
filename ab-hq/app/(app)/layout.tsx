import AppShell from "@/app/components/AppShell";

// Everything under this route group renders inside the app chrome and is
// protected by the auth middleware. /login lives outside it.
export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <AppShell>{children}</AppShell>;
}

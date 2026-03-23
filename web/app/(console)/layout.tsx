import AppShell from "@/components/AppShell";
import { AuthGuard } from "@/components/AuthGuard";

export default function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <AppShell>{children}</AppShell>
    </AuthGuard>
  );
}

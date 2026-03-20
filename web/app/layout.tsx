import "./tailwind.css";
import "./globals.css";

import AppShell from "@/components/AppShell";
import { ToastProvider } from "@/components/ToastProvider";
import { AuthProvider } from "@/components/AuthProvider";
import { AuthGuard } from "@/components/AuthGuard";
import ThemeHydrator from "@/components/ThemeHydrator";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <ThemeHydrator />
        <AuthProvider>
          <AuthGuard>
            <AppShell>{children}</AppShell>
          </AuthGuard>
          <ToastProvider />
        </AuthProvider>
      </body>
    </html>
  );
}

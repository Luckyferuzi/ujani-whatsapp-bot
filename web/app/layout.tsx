import "./tailwind.css";
import "./globals.css";

import Topbar from "@/components/Tobpar";
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
          <Topbar />
          <AuthGuard>{children}</AuthGuard>
          <ToastProvider />
        </AuthProvider>
      </body>
    </html>
  );
}

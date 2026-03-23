import "./tailwind.css";
import "./globals.css";
import "./design-system.css";

import { ToastProvider } from "@/components/ToastProvider";
import { AuthProvider } from "@/components/AuthProvider";
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
          {children}
          <ToastProvider />
        </AuthProvider>
      </body>
    </html>
  );
}

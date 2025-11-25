import "./globals.css";
import Topbar from "@/components/Tobpar";
import { ToastProvider } from "@/components/ToastProvider";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Topbar />
        {children}
        <ToastProvider />
      </body>
    </html>
  );
}

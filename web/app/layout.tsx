import "./globals.css";
import Topbar from "@/components/Tobpar";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en"><body><Topbar />{children}</body></html>
  );
}

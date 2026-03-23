import "../config-surfaces.css";
import "./admin-hub.css";

export default function AdminHubLayout({ children }: { children: React.ReactNode }) {
  return <div className="config-root admin-hub-root">{children}</div>;
}

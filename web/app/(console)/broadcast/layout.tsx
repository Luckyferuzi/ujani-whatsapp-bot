import "./broadcast.css";

export default function BroadcastLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="broadcast-root">{children}</div>;
}

import "../config-surfaces.css";

export default function SetupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="config-root">{children}</div>;
}

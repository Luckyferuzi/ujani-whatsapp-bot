import "./setup.css";

export default function SetupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="setup-root">{children}</div>;
}

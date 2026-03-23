import "../config-surfaces.css";

export default function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="config-root">{children}</div>;
}

import "./incomes.css";

export default function IncomesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="incomes-root">{children}</div>;
}
 
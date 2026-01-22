import "./expenses.css";

export default function ExpensesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="expenses-root">{children}</div>;
}

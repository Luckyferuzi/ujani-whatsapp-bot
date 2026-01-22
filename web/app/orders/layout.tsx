import "./orders.css";

export default function OrdersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="orders-root">{children}</div>;
}

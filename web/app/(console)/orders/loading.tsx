import {
  Card,
  SidePanelSkeleton,
  StatCardSkeleton,
  TableSkeleton,
} from "@/components/ui";

export default function OrdersLoading() {
  return (
    <div className="orders-page">
      <div className="orders-queue-grid">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>
      <div className="orders-controls">
        <TableSkeleton rows={2} />
      </div>
      <div className="orders-shell">
        <Card className="or-card" padding="lg">
          <TableSkeleton rows={8} />
        </Card>
        <Card className="or-card" padding="lg">
          <SidePanelSkeleton />
        </Card>
      </div>
    </div>
  );
}

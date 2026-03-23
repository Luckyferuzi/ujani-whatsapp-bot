import { Card, SidePanelSkeleton, TableSkeleton } from "@/components/ui";

export default function IncomesLoading() {
  return (
    <div className="incomes-page">
      <div className="ic-controls">
        <TableSkeleton rows={2} />
      </div>
      <div className="ic-shell">
        <Card className="ic-card" padding="lg">
          <TableSkeleton rows={8} />
        </Card>
        <Card className="ic-card" padding="lg">
          <SidePanelSkeleton />
        </Card>
      </div>
    </div>
  );
}

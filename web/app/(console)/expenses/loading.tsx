import { Card, SidePanelSkeleton, TableSkeleton } from "@/components/ui";

export default function ExpensesLoading() {
  return (
    <div className="expenses-page">
      <div className="ex-controls">
        <TableSkeleton rows={2} />
      </div>
      <div className="ex-shell">
        <Card className="ex-card" padding="lg">
          <TableSkeleton rows={8} />
        </Card>
        <Card className="ex-card" padding="lg">
          <SidePanelSkeleton />
        </Card>
      </div>
    </div>
  );
}

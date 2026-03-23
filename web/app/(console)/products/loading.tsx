import { Card, SidePanelSkeleton, TableSkeleton } from "@/components/ui";

export default function ProductsLoading() {
  return (
    <div className="products-page">
      <div className="pr-controls">
        <TableSkeleton rows={2} />
      </div>
      <div className="products-shell">
        <Card className="pr-card" padding="lg">
          <TableSkeleton rows={8} />
        </Card>
        <Card className="pr-card" padding="lg">
          <SidePanelSkeleton />
        </Card>
      </div>
    </div>
  );
}

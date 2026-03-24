import { Card, SidePanelSkeleton, TableSkeleton } from "@/components/ui";

export default function ProductsLoading() {
  return (
    <div className="products-page">
      <section className="pr-hero">
        <div className="pr-hero-copy">
          <div className="pr-hero-kicker">Commerce workspace</div>
          <div className="pr-hero-title">Loading product management...</div>
        </div>
      </section>
      <div className="pr-controls">
        <TableSkeleton rows={2} />
      </div>
      <div className="pr-shell">
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

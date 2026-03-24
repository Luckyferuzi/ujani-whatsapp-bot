import { Card, ChartSkeleton, StatCardSkeleton, TableSkeleton } from "@/components/ui";

export default function StatsLoading() {
  return (
    <div className="stats-page">
      <section className="st-insights-hero">
        <div className="st-insights-main">
          <div className="st-insights-kicker">Insights</div>
          <div className="st-insights-title">Loading performance overview...</div>
        </div>
      </section>

      <section className="st-toolbar">
        <div className="st-seg">
          <span className="st-chip">Preparing filters</span>
        </div>
      </section>

      <div className="st-kpi-grid">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>

      <div className="st-shell">
        <div className="st-primary-column">
          <Card className="st-card" padding="lg">
            <ChartSkeleton />
          </Card>
          <Card className="st-card" padding="lg">
            <TableSkeleton rows={6} />
          </Card>
        </div>

        <div className="st-secondary-column">
          <Card className="st-card" padding="lg">
            <TableSkeleton rows={4} />
          </Card>
          <Card className="st-card" padding="lg">
            <ChartSkeleton />
          </Card>
        </div>
      </div>
    </div>
  );
}

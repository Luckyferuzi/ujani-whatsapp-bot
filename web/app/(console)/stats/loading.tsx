import { Card, ChartSkeleton, StatCardSkeleton, TableSkeleton } from "@/components/ui";

export default function StatsLoading() {
  return (
    <div className="stats-page">
      <div className="st-topbar">
        <div className="st-title-wrap">
          <div className="st-title">Loading reports...</div>
        </div>
      </div>
      <div className="st-stat-grid">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>
      <div className="st-report-grid">
        <Card className="st-card" padding="lg">
          <ChartSkeleton />
        </Card>
        <Card className="st-card" padding="lg">
          <TableSkeleton rows={6} />
        </Card>
      </div>
    </div>
  );
}

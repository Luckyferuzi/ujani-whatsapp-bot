import { Card, FormSectionSkeleton, StatCardSkeleton, TableSkeleton } from "@/components/ui";

export default function SetupLoading() {
  return (
    <div className="config-page">
      <div className="config-stat-grid">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>
      <Card padding="lg" className="config-section-card">
        <FormSectionSkeleton />
      </Card>
      <Card padding="lg" className="config-section-card">
        <TableSkeleton rows={5} />
      </Card>
    </div>
  );
}

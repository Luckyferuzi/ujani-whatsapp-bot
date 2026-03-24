import { Card, FormSectionSkeleton, StatCardSkeleton, TableSkeleton } from "@/components/ui";

export default function AdminLoading() {
  return (
    <div className="admin-hub-page">
      <div className="admin-hub-summary">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>
      <div className="admin-hub-grid">
        <Card padding="lg" className="admin-hub-section">
          <FormSectionSkeleton />
        </Card>
        <Card padding="lg" className="admin-hub-section">
          <FormSectionSkeleton />
        </Card>
      </div>
      <Card padding="lg" className="admin-hub-section">
        <TableSkeleton rows={6} />
      </Card>
    </div>
  );
}

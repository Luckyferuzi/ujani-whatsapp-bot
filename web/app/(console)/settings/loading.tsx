import { Card, FormSectionSkeleton, StatCardSkeleton } from "@/components/ui";

export default function SettingsLoading() {
  return (
    <div className="config-page config-page--narrow">
      <div className="config-stat-grid">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>
      <Card padding="lg" className="config-section-card">
        <FormSectionSkeleton />
      </Card>
      <Card padding="lg" className="config-section-card">
        <FormSectionSkeleton />
      </Card>
    </div>
  );
}

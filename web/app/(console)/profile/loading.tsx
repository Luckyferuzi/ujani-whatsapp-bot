import { Card, FormSectionSkeleton, StatCardSkeleton } from "@/components/ui";

export default function ProfileLoading() {
  return (
    <div className="config-page config-page--narrow">
      <div className="config-account-grid">
        <Card padding="lg" className="config-identity-card">
          <FormSectionSkeleton />
        </Card>
        <Card padding="lg" className="config-section-card">
          <FormSectionSkeleton />
        </Card>
      </div>
      <div className="config-stat-grid">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>
      <Card padding="lg" className="config-security-card">
        <FormSectionSkeleton />
      </Card>
    </div>
  );
}

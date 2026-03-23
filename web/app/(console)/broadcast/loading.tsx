import { Card, EmptyState, FormSectionSkeleton, StatCardSkeleton } from "@/components/ui";

export default function BroadcastLoading() {
  return (
    <div className="broadcast-page">
      <section className="broadcast-hero">
        <div className="broadcast-hero__copy">
          <div className="broadcast-hero__kicker">Outbound control</div>
          <div className="broadcast-hero__title">Loading broadcasts...</div>
          <div className="broadcast-hero__text">
            Preparing the campaign workspace and delivery result surfaces.
          </div>
        </div>
      </section>

      <div className="broadcast-grid">
        <Card className="broadcast-panel" padding="lg">
          <FormSectionSkeleton />
        </Card>
        <div className="broadcast-side">
          <Card className="broadcast-panel" padding="lg">
            <EmptyState
              eyebrow="Preview"
              title="Preparing preview"
              description="The message preview will appear as soon as the surface is ready."
            />
          </Card>
          <Card className="broadcast-panel" padding="lg">
            <div className="broadcast-results">
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

import { Card, PageSkeleton } from "@/components/ui";

export default function ConsoleLoading() {
  return (
    <div className="console-page">
      <div className="console-page__container">
        <Card padding="lg">
          <PageSkeleton />
        </Card>
      </div>
    </div>
  );
}

import { Card, FormSectionSkeleton } from "@/components/ui";

export default function PublicLoading() {
  return (
    <div
      style={{
        width: "100%",
        maxWidth: "72rem",
        margin: "0 auto",
        padding: "2rem",
        display: "grid",
        gridTemplateColumns: "1.2fr 0.9fr",
        gap: "1.5rem",
      }}
    >
      <Card padding="lg">
        <FormSectionSkeleton />
      </Card>
      <Card padding="lg">
        <FormSectionSkeleton />
      </Card>
    </div>
  );
}

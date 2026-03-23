import { Card, ConversationListSkeleton, SidePanelSkeleton, ThreadSkeleton } from "@/components/ui";

export default function InboxLoading() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(18rem, 21rem) minmax(0, 1fr) minmax(18rem, 22rem)",
        gap: "1px",
        minHeight: "calc(100vh - 4rem)",
        background: "var(--ds-color-border-soft)",
      }}
    >
      <Card padding="lg" style={{ borderRadius: 0, border: 0, boxShadow: "none" }}>
        <ConversationListSkeleton rows={8} />
      </Card>
      <Card padding="lg" style={{ borderRadius: 0, border: 0, boxShadow: "none" }}>
        <ThreadSkeleton rows={9} />
      </Card>
      <Card padding="lg" style={{ borderRadius: 0, border: 0, boxShadow: "none" }}>
        <SidePanelSkeleton />
      </Card>
    </div>
  );
}

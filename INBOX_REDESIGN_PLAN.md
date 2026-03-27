# Inbox Redesign Plan

## Scope
This note documents the current inbox architecture in the Ujani WhatsApp console and prepares a safer redesign pass. It is intentionally tied to the current codebase and avoids backend or business-logic changes.

## Current Inbox File Inventory

### Page-level layout
- `web/app/(console)/inbox/page.tsx`
  - Owns selected conversation state.
  - Owns mobile vs desktop mode.
  - Owns summary visibility state.
  - Decides whether inbox renders:
    - conversation list only
    - thread only
    - thread + summary
    - mobile overlay summary

- `web/components/AppShell.tsx`
  - Owns outer console shell.
  - Marks `/inbox` as an immersive page.
  - Controls shell/sidebar behavior around the inbox.

### Conversation list
- `web/components/ConversationList.tsx`
  - Fetches `/api/conversations`.
  - Owns local search state.
  - Polls conversation list.
  - Emits selection upward through `onPick`.

### Thread / composer / message transcript
- `web/components/Thread.tsx`
  - Fetches `/api/conversations/:id/messages`.
  - Owns message state, loading state, optimistic sends, agent mode toggle state, hover state, action menu state, template modal state.
  - Owns message scroll ref and bottom-stick behavior.
  - Renders:
    - thread header
    - failure banner
    - message transcript
    - composer
    - template modal

- `web/components/TemplateSendModal.tsx`
  - Fetches template options for stale-thread sending.
  - Owns template selection and param form state.

### Summary / context panel
- `web/components/RightPanel.tsx`
  - Fetches conversation summary and related orders.
  - Owns tab state and selected order state.
  - Renders:
    - customer summary
    - order progress/timeline
    - activity/notes
    - conversation controls

### Styling / layout control
- `web/app/(console)/inbox/respondio.css`
  - Primary inbox layout stylesheet.
  - Controls:
    - page grid
    - rail/thread/summary widths
    - transcript spacing
    - composer presentation
    - summary panel structure
    - mobile inbox behavior
    - template modal styling

- `web/app/design-system.css`
  - Global design tokens and console-shell styling.
  - Relevant because inbox inherits shell sizing, sticky topbar behavior, and sidebar layout.

## Current State Ownership

### Owned by `page.tsx`
- `active`
- `isMobile`
- `mobileView`
- `showMobileMenu`
- `desktopContextOpen`
- conversation restore from localStorage

This is appropriate for high-level workspace orchestration and should stay page-level.

### Owned by `Thread.tsx`
- message collection
- message loading state
- optimistic send state
- agent/manual mode UI state
- composer text
- hover/action menu state
- scroll-to-bottom logic
- template modal open state

This is currently too broad for a redesign pass. The thread component is doing both layout orchestration and interaction logic.

### Owned by `RightPanel.tsx`
- summary data
- orders data
- active tab
- selected order
- clear/delete action loading

This is acceptable, but the component mixes inspector structure with detailed card composition and could be split later.

## Current Scroll Ownership

### What currently scrolls
- `body` / page shell should not be the primary scroller for inbox, but overall shell constraints still influence height.
- `.conversation-items` scrolls inside the conversation list.
- `.thread-messages` scrolls inside the thread body.
- `.rp-body` scrolls inside the right panel.
- on mobile, summary uses an overlay container with its own panel body.

### Why the current scroll model still feels fragile
- The inbox depends on a chain of `height: 100%`, `min-height: 0`, and `overflow: hidden` across many wrappers.
- Scroll works only if every ancestor participates correctly.
- `Thread.tsx` mixes layout assumptions with behavioral scroll logic.
- The sticky composer depends on the thread grid and footer container being sized exactly right.
- The summary and transcript are currently siblings inside the same focus region, which makes width and height feel tight when both are visible.

## Recommended Scroll Ownership After Redesign

### Desktop
- `page.tsx` / shell:
  - fixed-height workspace only
  - should not be an active content scroller
- conversation list:
  - own its own vertical scroll
- thread:
  - header fixed
  - transcript scroller owns vertical message reading
  - composer pinned to bottom of thread pane
- summary panel:
  - fixed inspector column with its own scroll

### Mobile
- one active pane visible at a time
- list and thread each own their own scroll
- summary can remain overlay/drawer on mobile for space reasons

## Structural Problems vs Cosmetic Problems

### Structural problems
- `page.tsx` combines desktop/mobile orchestration with layout-specific assumptions.
- `Thread.tsx` is responsible for too many concerns:
  - transport/error UX
  - menu state
  - transcript rendering
  - hover actions
  - composer state
  - scrolling
- Summary panel width is structurally coupled to the focus region grid.
- Scroll stability depends on many ancestors instead of a smaller number of deliberate scrollers.

### Cosmetic problems
- Message lane is too narrow for long reading sessions.
- Bubble treatment is still visually chat-like instead of console-like.
- Summary sections feel card-heavy and dense.
- Header identity block and composer styling need stronger hierarchy.
- Failure/warning surfaces could be visually calmer.

## Suggested Component Split for Redesign

These are recommended splits for the next pass, not required immediately.

### `Thread.tsx`
Split into:
- `ThreadHeader`
- `ThreadTranscript`
- `ThreadComposer`
- `ThreadMessageGroup` or `ThreadMessageRow`

Reason:
- separates layout from message interaction logic
- makes scroll ownership clearer
- allows transcript redesign without repeatedly touching send logic

### `RightPanel.tsx`
Split into:
- `ConversationInspectorHeader`
- `ConversationInspectorSummary`
- `ConversationInspectorActivity`
- `ConversationInspectorControls`

Reason:
- easier to redesign the right column as an inspector instead of a generic panel with stacked sections

### `page.tsx`
Keep as the orchestration layer, but eventually rename visual wrappers more explicitly:
- current `inbox-focus-region` -> likely `inbox-workspace`
- current `inbox-summary-region` -> likely `inbox-inspector`

## Practical Redesign Direction

### Phase A: layout stability
- simplify ancestor height/overflow chain
- keep three intentional scrollers only:
  - list
  - transcript
  - inspector
- preserve current behavior while reducing nested overflow dependencies

### Phase B: transcript-first workspace
- make thread visually dominant
- widen readable message lane
- keep header and composer aligned to the same lane
- reduce decorative bubble feel

### Phase C: calmer inspector
- keep summary persistent on desktop
- reduce visual weight
- improve section spacing and hierarchy

### Phase D: interaction polish
- unify async/loading treatment
- refine empty/loading/skeleton states
- keep hover actions discoverable but quiet

## Parts That Should Not Change In The Redesign
- existing conversation selection behavior
- read-marking behavior
- message send APIs
- socket update flow
- template send behavior
- summary/order/payment business logic

## Safe Preparation Notes
- `respondio.css` should remain the primary inbox stylesheet instead of scattering inbox overrides into multiple files.
- Future work should separate structural classes from transcript cosmetic classes before large visual changes.
- The next redesign pass should normalize a few visible mojibake strings in `Thread.tsx` and `TemplateSendModal.tsx` while touching transcript copy.


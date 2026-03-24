# Frontend Operational Clarity Pass

## Scope
- Final workflow and discoverability hardening for:
  - Command Center payment-proof review flow
  - product-management discoverability
  - orders discoverability and usability
  - analytics family navigation

## Fixes Completed

### Command Center -> Payment Review
- `Needs attention` payment-proof cards route to `/orders?status=verifying`.
- The payment-proof preview rows now open the exact verification context using the related order code or customer name when available.
- Fulfillment preview rows also open the relevant filtered pending queue instead of staying informational only.

### Product Management Discoverability
- Product management remains first-class in primary navigation as `Products`.
- The page continues to use explicit product-management language instead of being buried behind a softer catalog-only label.
- Primary management actions stay visible at the top of the page:
  - new product
  - import catalog
  - export CSV

### Orders Discoverability
- Orders remains in the primary `Operations` group in the sidebar.
- Dashboard priority and attention cards continue to open directly into useful order queues such as:
  - `/orders?status=verifying`
  - `/orders?status=pending`
- The orders page already consumes these query parameters on load, so the route is operationally useful rather than merely visible.

### Analytics Family Navigation
- Replaced inconsistent cross-links and stacked CTA switching with one shared analytics sub-navigation component.
- `/stats`, `/incomes`, and `/expenses` now read as one reporting family with consistent active-state handling and shared top-of-page navigation.

## Result
- Operators no longer need to guess where to:
  - review payment proofs
  - manage products
  - work the order queue
  - move between stats, income, and expenses

- The console now behaves more like a workflow-smart operations product, not just a visually improved interface.

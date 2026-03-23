# Frontend Design System Foundation

This document records the system-first foundation added for the `web/` frontend.

## Primary Entry Points

- CSS foundation: `web/app/design-system.css`
- UI primitives: `web/components/ui/index.tsx`
- Shared theme helpers: `web/lib/theme.ts`
- Shared configuration surfaces: `web/app/(console)/config-surfaces.css`
- Shared admin hub surfaces: `web/app/(console)/admin/admin-hub.css`

## What This Foundation Establishes

- semantic light and dark tokens
- premium neutral-led color system with restrained teal accent
- typography ladder for page, section, card, body, secondary, and meta text
- spacing, radius, border, elevation, and motion tokens
- loading and skeleton primitives as first-class UI
- reusable primitives for button, input, textarea, select, card, badge, tabs, alert, empty state, and loading states

## Token Categories

The CSS foundation defines:

- typography tokens: `--ds-font-*`, `--ds-text-*`
- spacing tokens: `--ds-space-*`
- radius tokens: `--ds-radius-*`
- motion tokens: `--ds-duration-*`, `--ds-ease-*`
- semantic surface and text tokens: `--ds-color-*`
- accent and status tokens for success, warning, danger, and info
- shadow and focus tokens
- skeleton tokens for subtle structural loading visuals

## Theme Model

Theme behavior is now centralized in `web/lib/theme.ts`.

- stored mode: `system`, `light`, or `dark`
- explicit overrides set `document.documentElement.dataset.theme`
- system mode falls back to OS preference
- `ThemeHydrator` now owns initial synchronization

This reduces the previous drift where theme behavior was duplicated in multiple components.

## Current Surface Layers

The live frontend now uses a smaller set of presentation layers:

- `design-system.css` for tokens, primitives, shell, auth, and global shared patterns
- `config-surfaces.css` for setup, workspace settings, and my account
- `admin-hub.css` for admin users, governance, and audit
- route-local CSS only where a full route migration is still intentionally scoped to that surface

Temporary migration artifacts that have now been removed:

- `web/app/ui.css`
- `web/app/(console)/setup/setup.css`
- `web/app/(console)/profile/profile.css`
- legacy auth/admin utility selector blocks previously left in `web/app/globals.css`

## Primitive Set

The current reusable primitives are:

- `Card`
- `Button`
- `Input`
- `Textarea`
- `Select`
- `Badge`
- `Tabs`
- `Alert`
- `EmptyState`
- `InlineLoading`
- `Skeleton`
- `SkeletonText`
- `PageSkeleton`
- `StatCardSkeleton`
- `TableSkeleton`
- `ListRowSkeleton`
- `FormSectionSkeleton`
- `ThreadSkeleton`
- `SidePanelSkeleton`
- `ChartSkeleton`

## Migration Intent

This foundation is meant to support later route redesigns without creating another competing styling system.

Later prompts should consume this system rather than:

- adding new route-specific CSS vocabularies
- duplicating theme logic
- inventing new token names for page-local use
- reviving old partial UI-system artifacts as separate foundations

Cleanup should continue in the same direction:

- prefer shared semantic layers before adding route-local selectors
- remove dead legacy selectors once a route is confirmed migrated
- avoid cross-page CSS imports between unrelated routes

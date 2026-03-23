# Frontend Redesign Charter

This document is the governing interface charter for the existing Next.js application under `web/`.

It defines the redesign constitution for future frontend work. It does not authorize backend, API, database, or product-scope changes.

## Product Context

- Product: WhatsApp commerce operations console
- Primary users: admins, owners, staff, operators
- Work style: daily operational use, high frequency, information-dense, trust-sensitive
- Redesign goal: transform the frontend into a premium, calm, high-trust operations console without changing the underlying business functionality

## Past Problems To Correct

The current frontend should be treated as functional but visually fragmented. Future work must explicitly correct these conditions:

- Legacy global CSS accumulation with overlapping responsibilities
- Route-level CSS files creating page-by-page visual drift
- Multiple generations of styling and partial UI-system attempts coexisting
- Duplicated component semantics and inconsistent shell behavior
- Oversized containers and weak information hierarchy
- Uneven spacing, typography, and panel treatment
- Inconsistent dark mode quality and weak light/dark parity
- Loading states that can feel unstable, fragmented, or visually noisy
- Some pages reading like CRUD admin screens while others read like unfinished premium experiments

These are historical problems to solve, not styles to preserve.

## Present Scope

This charter covers interface architecture and presentation only:

- layout systems
- shell behavior
- design tokens
- component language
- typography
- spacing
- surfaces
- states
- loading behavior
- light and dark mode parity
- page composition patterns

This charter does not include new business capabilities.

## Future Target State

The product should feel:

- premium
- modern
- serious
- high-trust
- efficient
- restrained
- calm
- designed for daily operational work

The UI should read as a coherent operations product, not a collection of unrelated admin pages.

## Redesign Charter Checklist

Every future frontend implementation should satisfy this checklist:

- Use one clear visual system across the entire `web/` application.
- Consolidate shell, layout, and shared primitives instead of styling each route independently.
- Replace visual inconsistency with a stable hierarchy of page, section, panel, and control patterns.
- Prioritize calm operational density over decorative marketing-style UI.
- Preserve working business flows and data behavior while upgrading presentation quality.
- Ensure strong parity between light and dark themes in contrast, depth, and readability.
- Favor restrained accent usage and semantic status color usage only.
- Preserve shell geometry and avoid layout jumps during navigation or loading.
- Use skeletons, reserved space, and localized loading states instead of large blocking spinners.
- Ensure component semantics are reusable and predictable across routes.
- Reduce legacy CSS fragmentation rather than adding new one-off route styling systems.
- Keep redesign work scoped to interface concerns unless a tiny structural change is required to support presentation consistency.

## Non-Negotiable UI Rules

These rules are mandatory for all later prompts and contributors.

### 1. One Styling Direction

- Do not keep multiple competing styling systems alive.
- Do not introduce new page-specific visual languages.
- Shared tokens, primitives, and layout rules must govern every route.
- If legacy CSS must remain temporarily, it should be treated as migration debt and reduced over time, not expanded as the default pattern.

### 2. Shell First

- The application shell is the primary source of consistency.
- Navigation, header behavior, content framing, spacing rhythm, and page transitions must be standardized at the shell level first.
- Routes may specialize content, but not reinvent shell structure.

### 3. Premium Neutral System

- Base the product on premium neutrals first, restrained accent second.
- Light mode should use warm off-whites, clean whites, soft grays, and dark graphite text.
- Dark mode should use layered charcoal and slate surfaces, not pure black or noisy gradients.
- The accent should be deep teal or emerald-led and used with discipline.
- Success, warning, error, and info colors are semantic tools, not decorative branding.

### 4. Strong Hierarchy

- Typography must create clear scan paths for operators.
- Page titles, section headings, labels, supporting text, and metadata must have distinct roles.
- Spacing should be deliberate, repeatable, and tokenized.
- Visual emphasis should come from hierarchy, contrast, and alignment, not oversized cards or exaggerated shadows.

### 5. Calm Density

- Dense interfaces are acceptable when they remain orderly and legible.
- Avoid oversized paddings, giant empty shells, and bloated cards.
- Avoid cramped layouts that reduce readability or increase operator fatigue.
- Tables, lists, side panels, and detail views should feel efficient but never harsh.

### 6. Surface Discipline

- Panels should feel quiet, structured, and trustworthy.
- Avoid candy-like chips, excessive tinting, giant shadows, and over-rounded containers.
- Use elevation sparingly; separation should come primarily from tone, border, and spacing.
- Repeated panel types should share consistent radius, border, background, and header behavior.

### 7. Loading Discipline

- Loading must preserve layout stability.
- Prefer skeletons and placeholder structures over central spinners.
- Use localized loading states where possible instead of blocking whole pages.
- Prevent white flashes, collapsed shells, and reflow-heavy transitions.
- Progressive reveal is preferred when data arrives in stages.

### 8. Theme Parity

- Light mode and dark mode must feel equally designed.
- Dark mode is not a color inversion pass.
- Each theme must preserve hierarchy, contrast, focus visibility, and semantic clarity.
- Components that are readable and premium in light mode must be intentionally tuned for dark mode.

### 9. Semantic Reuse

- Buttons, badges, filters, tables, empty states, forms, drawers, and cards must have reusable semantic variants.
- Do not create near-duplicate components with slightly different styling for each route.
- If two surfaces communicate the same meaning, they should share the same component semantics.

### 10. No Functional Drift

- Do not redesign backend APIs.
- Do not invent new business logic.
- Do not change database models.
- Do not add new product functionality unless required for presentation-state support.
- Do not alter working business rules except for tiny interface-supportive structural adjustments.

## Visual North Star

Use the following implementation-ready direction as the baseline for future UI work.

### Tone

- Premium, restrained, calm, serious
- More operations console than generic dashboard
- More trust and clarity than trendiness
- More alignment and rhythm than visual variety

### Color Strategy

- Neutral-led palette
- Warm light backgrounds with clean panel whites
- Dark theme with layered charcoal and slate surfaces
- Deep teal or emerald accent for key focus states, selected navigation, and primary actions
- Semantic colors reserved for status, alerting, and business meaning

### Typography Strategy

- Clear title scale for page identity
- Strong but restrained section headings
- Highly legible body copy optimized for scanning
- Muted metadata styles that remain readable
- No weak hierarchy caused by similar sizes or similar tones across all text roles

### Layout Strategy

- Stable application shell
- Predictable content widths and panel groupings
- Consistent spacing rhythm across pages
- Reusable section headers, filter bars, data panels, and detail panes
- Responsive behavior that preserves hierarchy rather than collapsing into randomness

### Component Strategy

- Quiet cards and panels
- Crisp table and list presentation
- Controlled control styling for filters, forms, tabs, toggles, and actions
- Empty, error, success, and loading states designed as first-class UI states
- Minimal decorative effects and highly intentional focus/hover/selected states

### Motion And State Strategy

- Subtle transitions only where they reinforce continuity
- No flashy animations
- Loading and navigation should feel smooth, localized, and non-disruptive
- State changes should communicate confidence and control

## Interface-Only Boundaries

Future prompts must stay inside these boundaries unless explicitly expanded by product direction:

- No backend endpoint redesign
- No auth model redesign
- No database schema changes
- No changes to business rules for orders, products, inbox, broadcast, reporting, setup, or governance flows
- No new workflow invention beyond presentation support
- No speculative product features disguised as UI polish
- No visual experiments that break route consistency
- No preservation of legacy styling just because it already exists

Allowed implementation work includes:

- refactoring layout structure for consistency
- consolidating design tokens
- building shared UI primitives
- rewriting page presentation using the new system
- improving responsive behavior
- improving loading, empty, and error presentation
- improving light/dark parity
- removing or reducing legacy CSS drift

## Decision Filter For Future Contributors

Before making frontend changes, verify:

- Does this move the app toward one coherent operations-console language?
- Does this improve calmness, clarity, trust, and daily usability?
- Does this reduce fragmentation instead of adding another exception?
- Does this preserve business functionality and avoid backend drift?
- Does this improve shell stability, loading predictability, and theme parity?

If the answer is no, the change should be reconsidered.

## Immediate Guidance For Subsequent Redesign Work

Later prompts should generally proceed in this order:

1. establish or refine the shared token and shell foundation
2. normalize reusable layout and component primitives
3. redesign high-traffic operational routes using the shared system
4. remove route-specific visual exceptions that conflict with the charter
5. tighten loading, empty, error, and dark-mode states to parity

Do not jump straight into isolated page beautification without strengthening the shared system first.

## Summary

This charter separates:

- past problems: fragmented styling, legacy drift, weak hierarchy, inconsistent theme quality
- present scope: interface architecture and presentation only
- future target: premium, calm, high-trust, efficient operations console

All future frontend redesign work in `web/` should follow this document unless it is intentionally superseded by a newer charter.

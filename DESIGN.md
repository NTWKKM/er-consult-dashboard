# DESIGN.md - Hallmark Console Clinical System (v2.0.0)

## 1. Aesthetic Direction: Stepped Console Surfaces & Hairline Clarity
The ER Consult Dashboard employs the Hallmark **Console** theme (`deal: 2/3, seed hospital-emergency-room-surgical-b478·126f3d5c·2026-11-18·r0`), balancing high-density clinical legibility with dual-mode (`paper` light / `graphite` dark) OKLCH precision:
- **Surface Ladder:** Three stepped neutral levels (`--color-paper`, `--color-paper-2`, `--color-paper-3`) declared in `app/tokens.css`. Elevation comes from lightness steps and 1px hairline borders (`--color-rule`, `--color-rule-2`), with drop shadows and blurred orbs eliminated to prevent visual noise.
- **High Contrast:** Text pairs (`--color-ink`, `--color-ink-2`, `--color-muted`) and semantic status tokens (`--color-ok`, `--color-bad`, `--color-accent`, `--color-cool`) are calibrated in OKLCH to meet WCAG AA/AAA contrast across both light (`paper`) and dark (`graphite`) modes.

## 2. Layout Architecture: Modernized Whiteboard
The dashboard is designed for high-stress ER environments with **Extreme Clarity + Fluidity**.
- **Layout Architecture:** Modernized Whiteboard (Grid/Table Toggle) with `@container` (`table-container`) support and sticky table headers (`sticky top-0 z-10`). ER staff require a global view of all active consults divided cleanly by departments (Surgery vs Ortho).

## 3. Motion & Micro-Animations
In a high-pressure ER, animations must serve a cognitive purpose, not just decoration.
- **State Changes:** Use the **View Transitions API** (`document.startViewTransition`) for seamless morphing when toggling Table/Card view or filters, honoring `prefers-reduced-motion: reduce`.
- **Interactive Feedback:** Buttons use `.tap-feedback` (`transform: scale(0.97)`) and compositor-safe `transition-colors` / `transition-opacity` (`duration-200`, `--ease-out`). No `transition-all`, parallax, or continuous bounce animations.

## 4. Typography & Readability
- **Font Stack:** `Host Grotesk` + `Noto Sans Thai` for clinical reading and UI controls; `Atkinson Hyperlegible Mono` (`.measured`, `.tabular-nums`, `font-variant-numeric: tabular-nums slashed-zero`) for Hospital Numbers (HN), timestamps, elapsed timers, and case counts so zero/O and 1/I are unmistakable at a glance.
- **Hierarchy:** Sentence-case labels and table headers without tracked uppercase pills; semantic weight separation (`font-medium` vs `font-normal`).

## 5. Semantic Color Tokens (`app/tokens.css`)
- **Primary Operator Action (`--color-accent`):** Amber for primary actions, active navigation bar accents, and pending post-accept states (`คืน ER` / status selection).
- **Clinical Status:** `--color-bad` (Red) for Urgent/Fast Track & Surgery triage; `--color-ok` (Green) for Ortho & case acceptance (`รับเคส`); `--color-cool` (Cool Blue) for room transfer instruments & historical milestones.
- **Browser Surfaces:** `::selection`, `caret-color`, custom scrollbars, and `dialog:modal` `overscroll-behavior: contain` are themed via CSS tokens.

## 6. Strict Development Guardrails
- **Token-Only Styling:** All colors and typography in `app/` must resolve through `app/tokens.css` variables (`bg-paper`, `text-ink`, `border-rule`, etc.); raw hex literals and stock Tailwind color palettes are prohibited.
- **Offline Resiliency Display:** Optimistic updates must provide immediate visual feedback. Network drops trigger the `OfflineIndicator` banner without obstructing the main clinical view, and failed background mutations trigger rollback + `ToastContext` notifications.
- **Accessibility & Hallmark Floor:** All decorative `<svg>` elements carry `aria-hidden="true"`, keyboard focus rings (`:focus-visible`) appear immediately, and `sloplint.mjs app --scope app` must report `0 FAIL`.

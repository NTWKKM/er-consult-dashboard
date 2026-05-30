# DESIGN.md - 2026 Extreme Clarity & Fluidity

## 1. Aesthetic Direction: Minimalist Glassmorphism
The ER Consult Dashboard employs a 2026 minimalist glassmorphism aesthetic that balances spatial depth with clinical clarity.
- **Backdrops:** Use subtle `backdrop-blur` (e.g., `backdrop-blur-md` or `backdrop-blur-lg`) on floating panels to create a sense of depth without distraction.
- **Borders & Elevation:** Use micro-borders (e.g., `border border-white/20` in light mode or `border-gray-700/50` in dark mode) combined with soft shadow scaling (`shadow-sm`, `shadow-lg`, `shadow-2xl` on hover).
- **High Contrast:** Text must always pass AAA accessibility for contrast, especially for critical medical data (HN, Diagnosis, Urgency).

## 2. Layout Architecture: Modernized Whiteboard
The dashboard is designed for high-stress ER environments. It embraces the "2026 UI/UX Standard" which focuses on **Extreme Clarity + Fluidity**.
- **Layout Architecture:** Modernized Whiteboard (Grid/Table Toggle). ER staff require a global view of all cases simultaneously. We present all active consults divided cleanly by departments (Surgery vs Ortho) while applying Glassmorphism to reduce clutter.

## 3. Motion & Micro-Animations
In a high-pressure ER, animations must serve a cognitive purpose, not just decoration.
- **State Changes:** Use the **View Transitions API** (`document.startViewTransition`) for seamless morphing when elements change state (e.g., toggling Table/Card view, accepting a case).
- **Interactive Feedback (Micro-animations):** Hover states on buttons/cards should feature a subtle scale (e.g., `scale-95` on active, `hover:-translate-y-0.5`) with snappy easing (`duration-200 ease-out`). No bouncy or slow transitions.

## 4. Typography & Readability
- **Font Stack:** Use modern sans-serif fonts. Ensure tabular numbers (`tabular-nums`) for all IDs, HN numbers, and timestamps to prevent layout shifting.
- **Hierarchy:** Use extreme font weight contrasts (e.g., `font-normal` vs `font-extrabold`) rather than relying purely on color differences.

## 5. Color Palette (Dark & Light)
- **Primary Actions:** Keep standard medical color psychology (Red `#E55143` for Urgent/Surgery, Green `#699D5D` for Ortho/Success).
- **Surfaces:**
  - **Light Mode:** Off-white backgrounds (`bg-[#f9fafc]`) with semi-transparent white panels (`bg-white/90`).
  - **Dark Mode:** Deep grays (`bg-gray-900`) with elevated dark surfaces (`bg-gray-800/80`).

## 6. Strict Development Guardrails
- **No Distracting Fluff:** Do not implement scroll-driven parallax or continuous loop animations.
- **Offline Resiliency Display:** Optimistic updates must provide immediate visual feedback. Network drops must trigger the `OfflineIndicator` banner (View Transitions compliant) without obstructing the main clinical view. If a network request fails, the UI rollback must be accompanied by a clear, non-intrusive Toast notification.
- **Consistency:** Any new component must strictly follow these rules and be approved by the UI Architect Sub-Agent.

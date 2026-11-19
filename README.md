# ER Consult Dashboard (MNRH)

Real-time, offline-resilient clinical consultation whiteboard for hospital Emergency Room (ER) staff built with Next.js (App Router), TypeScript, Tailwind CSS v4, and Firebase Firestore.

## Quick Start

1. Copy `.env.example` to `.env.local` and populate Firebase Web SDK credentials:

   ```bash
   cp .env.example .env.local
   ```

2. Install dependencies and start the development server:

   ```bash
   npm ci
   npm run dev
   ```

3. Open [http://localhost:3000](http://localhost:3000).

## Verification Commands

```bash
npm run verify      # TypeScript check + ESLint + Vitest suite
npm run typecheck   # tsc --noEmit
npm run lint        # ESLint (Next.js core-web-vitals + TypeScript)
npm test            # Vitest unit & integration tests
npm run build       # Production Next.js build
```

## Architecture & Design Standards

- See [ARCHITECTURE.md](./ARCHITECTURE.md) for data integrity protocols, Firestore rules/indexes, and consult lifecycle semantics.
- See [DESIGN.md](./DESIGN.md) for Hallmark Console OKLCH design tokens and UI guardrails.

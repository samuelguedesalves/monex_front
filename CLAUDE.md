# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

This project uses **bun** as the package manager/runtime (see `.tool-versions`).

- `bun install` — install dependencies
- `bun run dev` — start the Vite dev server
- `bun run build` — type-check (`tsc -b`) then build for production
- `bun run lint` — run ESLint over the repo
- `bun run preview` — preview the production build locally

There is no test framework configured in this repo (no Jest/Vitest/Playwright/etc.) — don't assume one exists.

## Architecture

This is the frontend for **Monex**, a toy banking app. The backend lives in the sibling repo at `monex_api` (Elixir/Phoenix, exposes a GraphQL API) — when behavior depends on API shape, check there.

### Stack

React 19 + TypeScript + Vite, Tailwind CSS v4, shadcn/ui (Radix-based) components, `react-router` v7 (`createBrowserRouter`), `react-hook-form` + `zod` for forms, `sonner` for toasts.

- Path alias `@/*` → `src/*` (configured in both `vite.config.ts` and `tsconfig.app.json`).
- `src/main.tsx` is the real app entry point and owns the router — `src/App.tsx` is leftover scaffolding from the Vite template and is not mounted anywhere.

### Routing & layout (`src/main.tsx`)

Routes are nested under a `RootLayout` that wraps everything in `AuthProvider`. Two branches:
- **Public**: `PublicLayout` (simple header) → `/login`
- **Private**: gated by `PrivateRoute` (redirects to `/login` if no token), then `PrivateLayout` (logged-in header) → `/` (Dashboard)

### Auth (`src/contexts/auth-context.tsx`)

`AuthProvider` holds `{ user, token }` state, persisted to `sessionStorage` (not `localStorage`) under `auth_token`/`auth_user`. Exposes `login`, `logout`, `refreshUser` via the `useAuth()` hook. `login`/`logout` call `navigate()` directly, so `AuthProvider` must stay inside the router tree. `PrivateRoute` only checks for presence of `token`, not validity.

### Backend communication (`src/services/*`)

No GraphQL client library (no Apollo/urql) — each service file does raw `fetch` POSTs to `import.meta.env.VITE_API_URL` (defaults to `http://localhost:4000/api`), sending `{ query, operationName, variables }` and unwrapping `json.data` / throwing on `json.errors`.

- `services/user.ts` — auth mutation + current user query.
- `services/transaction.ts` — recipient lookup by email + create transaction mutation; has a small `gqlRequest<T>` helper used by both calls in that file.
- `services/transactions.ts` — **mock data only** (hardcoded array), not yet wired to the backend; `TransactionsTable` consumes this.

There's duplication between `user.ts` and `transaction.ts` (each defines its own fetch/error-handling boilerplate) — if extending the GraphQL layer, consider whether to consolidate into one shared client rather than adding a third copy.

### Money values

Amounts are integers in cents everywhere (API and frontend state) — UI converts with `formatMoney()` (`src/lib/numberFormatter.ts`), which divides by 100 and formats as `$ X.XX`. Forms that take decimal user input (e.g. transfer amount) convert via `Math.round(Number(value) * 100)` before sending to the API.

### Multi-step dialogs

`NewTransferDialog` (`src/components/new-transfer-modal.tsx`) is the reference pattern for step-based flows: an outer component owns `currentStep`/form state across steps, renders a numbered step indicator, and conditionally renders one step subcomponent at a time (`SearchAccount` → `SetValue` → `Confirm` → `Success`), each with its own `react-hook-form` + `zod` schema where relevant.

### shadcn/ui components

`src/components/ui/*` are shadcn-generated primitives (style: `radix-nova`, base color `neutral`, icon library `lucide`) — see `components.json` for config. Treat these as generated/vendored; prefer composing them from `src/components/*` rather than editing primitives unless the design system itself needs to change.

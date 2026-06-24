# Handoff: Apollo Client Migration

**Status:** Implementation complete on branch `worktree-feat+apollo-client-migration`, kept as-is per user choice — **not yet merged to `main`**. Worktree at `/home/smk/projects/monex_front/.claude/worktrees/feat+apollo-client-migration`.

## What changed

The frontend's GraphQL transport moved from raw per-file `fetch` calls to a single Apollo Client instance, used via Apollo's React hooks everywhere. 7 commits, `116a749..f6d64dc`:

- **`src/lib/apollo-client.ts`** (new) — singleton `ApolloClient`. An auth link (`SetContextLink`) reads the token straight from `sessionStorage` on every request; an error link (`ErrorLink`) detects the backend's `"unauthenticated"` GraphQL error and clears `sessionStorage` + hard-redirects to `/login`.
- **`src/main.tsx`** — wraps `RouterProvider` in `ApolloProvider`.
- **`src/graphql/user.ts`** / **`src/graphql/transaction.ts`** (new) — `gql` documents and shared TS types, replacing `src/services/user.ts` / `src/services/transaction.ts` (both **deleted**).
- **`src/contexts/auth-context.tsx`** — `login`/`logout`/`refreshUser` keep their exact external signatures, but internally now call `useMutation`/`useLazyQuery` instead of the old fetch-based service functions.
- **`src/components/transactions-table.tsx`** — replaced manual fetch/state/race-guard logic with `useQuery` (`fetchPolicy: "network-only"`, `skip: !token`).
- **`src/components/new-transfer-modal.tsx`** — `SearchAccount` uses `useLazyQuery`, `Confirm` uses `useMutation`.

Full design: [docs/superpowers/specs/2026-06-21-apollo-client-migration-design.md](specs/2026-06-21-apollo-client-migration-design.md)
Implementation plan (as corrected and executed): [docs/superpowers/plans/2026-06-21-apollo-client-migration.md](plans/2026-06-21-apollo-client-migration.md)

## The big surprise: Apollo Client v4, not v3

The plan was written assuming Apollo Client v3's API (the version most docs/tutorials still describe). `bun add @apollo/client graphql` installed **v4.2.3** — the actual current latest major version — which has a materially different API:

- `setContext`/`onError` factory functions are deprecated; v4 uses `SetContextLink`/`ErrorLink` **classes** instantiated with `new`.
- Error inspection is `CombinedGraphQLErrors.is(error)` (imported from `@apollo/client/errors`) then `error.errors.some(...)`, not destructured `graphQLErrors`/`networkError`.
- `ApolloClient` lost its generic type parameter — it's `new ApolloClient({...})`, not `new ApolloClient<NormalizedCacheObject>({...})`.
- **`useQuery`/`useLazyQuery`/`useMutation`/`ApolloProvider` moved to the `@apollo/client/react` subpath.** Only `gql`, `ApolloClient`, `InMemoryCache`, `HttpLink` remain importable from the top-level `@apollo/client` package. Importing hooks from the top level silently doesn't exist in v4 and would fail to compile.

This was caught when Task 1's implementer subagent refused to guess and flagged the mismatch instead of forcing the brief's literal (non-compiling) code — the right call. It was then verified directly against the installed package's own `.d.ts`/`.js` source files (not assumed from migration-guide prose, which itself contained a minor internal inconsistency), the plan document was corrected in-place (commit `de03a89`), and every subsequent task's implementer was briefed on the correction explicitly rather than trusting the original brief text. **If you ever see Apollo Client import errors in this codebase, check whether someone reverted to v3-era import paths — `@apollo/client/react` is required for hooks in this project's installed version.**

## Recurring deviation: explicit type generics on hooks

Plain `gql` template literals (from the `graphql-tag` package Apollo re-exports) return an untyped `DocumentNode`, not a `TypedDocumentNode`. Without explicit type arguments, `data` from `useQuery`/`useLazyQuery`/`useMutation` infers as `{}`, and any property access on it fails to compile. Every task that added a hook call needed small hand-written type aliases or inline generics (e.g. `useMutation<{ createTransaction: { id: number } }, { amount: number; userId: number }>(...)`). Each instance was checked against the actual GraphQL document's selection set by the task reviewer — one was even verified by deliberately reverting the generics and reproducing the resulting `TS2339` compile error. If you add a new Apollo hook call in this codebase, expect to do the same.

## Key decisions (in case they look surprising later)

- **401 detection matches on the literal string `message === "unauthenticated"`**, not a stable machine-readable error code. `monex_api`'s `Authentication` Absinthe middleware (`lib/monex_web/middlewares/authentication.ex`) returns `{:error, :unauthenticated}` as a GraphQL-level error with **HTTP 200** — the backend never returns a real 401 status. This was an explicit user choice over adding a backend error-code field, accepting the coupling risk since both repos are co-developed privately.
- **Hard redirect (`window.location.href = "/login"`)**, not a custom DOM event wired back into `AuthProvider`. Explicit user choice over an event-listener approach, trading a full page reload for simplicity — it also has the side benefit of fully wiping Apollo's in-memory cache and React state on logout.
- **`AuthProvider` is the one place hooks are called on behalf of imperative consumers.** `login`/`logout`/`refreshUser` are called from event handlers (`LoginForm`'s `onSubmit`, `Confirm`'s `handleConfirm`), not from render — but `AuthProvider` itself *is* a component, so it calls `useMutation`/`useLazyQuery` at its own top level and exposes the same imperative function signatures consumers already used. No consumer-side changes were needed.
- **`fetchPolicy: "network-only"`** is set on `TransactionsTable`'s `useQuery` and `auth-context.tsx`'s `refreshUser` lazy query, preserving the original always-hit-the-network behavior (the old raw-fetch code never cached anything, and a transfer can change server-side state — like a transaction list or balance — that Apollo's cache wouldn't otherwise know to invalidate).
- **GraphQL documents and types moved to a new `src/graphql/` directory**, not kept in the old `src/services/*.ts` files. Explicit user choice — the old "service" naming implied imperative fetch functions, which no longer exist once everything is a `gql` document consumed by hooks.

## Verification performed

No browser-automation tool exists in this environment (consistent with the prior feature's handoff). Verification was:
- `bun run build` (type-check) after every task — all green.
- `bun run lint` — zero new warnings.
- **Live `curl` calls against the real, running `monex_api` backend** to reproduce the 401 path: a request with a corrupted bearer token returns `200 OK` with `errors[0].message === "unauthenticated"`, confirmed byte-for-byte. A negative-case curl (a deliberately malformed query) confirmed the error link does *not* false-positive logout on unrelated GraphQL errors.
- **Source-level tracing through the actually-installed `node_modules/@apollo/client` JS source** (not type declarations alone) to confirm `ErrorLink` really does construct a `CombinedGraphQLErrors` instance from any response with a top-level `errors` array, and that the predicate in `src/lib/apollo-client.ts` evaluates as expected against the real backend's JSON shape.
- Careful manual code-tracing of each rewritten component's control flow against the pre-migration original, cross-checked by an independent task-reviewer subagent for every task (5 implementation tasks + 1 verification-only task, each with its own spec-compliance + code-quality review; one fix round in Task 1 for an uncommitted-dependencies slip).
- A final whole-branch review (most capable model) — verdict: **ready to merge**, no Critical/Important findings.

**Before this reaches real users**, someone with a browser should still manually walk through: login (valid/invalid), the full transfer flow (search → confirm → success), transactions table pagination, and — ideally — the 401 path by corrupting `sessionStorage.auth_token` via devtools and confirming the redirect to `/login` actually happens in a real browser tab, not just in the curl/source-trace reasoning above.

## Open items (Minor, non-blocking, noted by final review)

- `transactions-table.tsx`'s `refreshKey`-changed effect can fire a redundant `refetch()` when a transfer completes while already on page 1 (harmless — `refreshUser()` already triggers one network round-trip; this adds one more for the transactions list specifically — consistent with the original always-network behavior, just slightly more requests than strictly necessary).
- `src/graphql/user.ts` exports `AuthResult`, but `auth-context.tsx` defines its own inline type aliases instead of consuming it — mild unused-surface drift, not a bug.
- `new-transfer-modal.tsx`'s `SearchAccount` types only the `useLazyQuery` data parameter, not the variables parameter — low risk given the query is trivial (`$email: String!`), but inconsistent with `Confirm`'s `useMutation` which types both.
- Bundle size grew to ~699 kB raw / ~214 kB gzipped (Vite's >500 kB chunk-size advisory). Proportionate to adding Apollo Client; a follow-up for route-level code-splitting (`manualChunks`) would be reasonable but is out of scope for this migration.

## Process note

Executed via `superpowers:subagent-driven-development` — fresh implementer subagent per task, task-scoped review after each, one fix round (Task 1: uncommitted `package.json`/`bun.lockb` dependency changes), then a final whole-branch review. Full audit trail (task briefs, implementer reports, reviewer verdicts, diffs) is in `.superpowers/sdd/` in the worktree root (git-ignored scratch space; not committed).

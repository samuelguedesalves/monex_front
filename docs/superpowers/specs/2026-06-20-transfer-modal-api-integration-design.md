# Transfer Modal API Integration — Design

## Goal

Wire up `NewTransferDialog` ([src/components/new-transfer-modal.tsx](../../../src/components/new-transfer-modal.tsx)) to the real GraphQL API instead of hardcoded fake data, using authenticated (JWT) requests. Introduce a `transaction` service to talk to the API, following the existing pattern in [src/services/user.ts](../../../src/services/user.ts).

Out of scope: `TransactionsTable` ([src/components/transactions-table.tsx](../../../src/components/transactions-table.tsx)) stays mocked — wiring the transactions list to `transactionsFromUser` is a separate task.

## API reference (from monex_api)

- `query userByEmail(email: String!): UserByEmail` — authenticated. Returns `{ id, firstName, lastName, email }` (no balance). **Correction (confirmed via live verification against `monex_api/lib/monex/users.ex`):** for a non-existent email, the resolver returns a GraphQL error (`"user not found"`), not a `null` data result. Callers should treat "not found" as the thrown-error path, not a null check on the response data.
- `mutation createTransaction(input: { amount: Int!, userId: Int! }): Transaction` — authenticated. Returns `{ id, amount, fromUser, toUser, processedAt, status }`.
- `query user: User` — authenticated, returns the current user (`{ id, firstName, lastName, email, balance }`). Used to refresh balance after a transfer.
- `amount` and `balance` are integers in **cents** (confirmed via [src/lib/numberFormatter.ts](../../../src/lib/numberFormatter.ts) which divides by 100).

All authenticated calls require header `Authorization: Bearer <token>`.

## 1. Shared authenticated GraphQL helper

Add a small internal helper (in `src/services/transaction.ts`, or a shared `src/services/gql.ts` if duplication with `user.ts` becomes awkward — final call made during implementation) that:

- POSTs `{ query, operationName, variables }` to `GQL_ENDPOINT` (same env var pattern as `user.ts`).
- Adds `Authorization: Bearer <token>` header when a token is passed.
- Throws on `!response.ok`, and on `json.errors?.length` (using the first error's message), matching the existing error handling in `authUser`.

`user.ts`'s existing `authUser` stays unauthenticated (no token at login time); the new helper is used by the new authenticated calls.

## 2. `src/services/transaction.ts` (new file)

```ts
export type TransferRecipient = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
};

export type Transaction = {
  id: number;
  amount: number;
  fromUser: number;
  toUser: number;
  processedAt: string;
};

export async function getUserByEmail(email: string, token: string): Promise<TransferRecipient | null>;

export async function createTransaction(
  input: { amount: number; userId: number },
  token: string
): Promise<Transaction>;
```

- `getUserByEmail` returns `null` when the API returns no user (not found), rather than throwing — "not found" is an expected outcome, not an error.
- `createTransaction` throws on API error (e.g. insufficient balance), surfacing `json.errors[0].message`.

## 3. `src/services/user.ts` (extend)

Add:

```ts
export async function getCurrentUser(token: string): Promise<AuthUser>;
```

Calls the `user` root query, reusing the same authenticated helper. Used to refresh balance after a successful transfer.

## 4. `src/contexts/auth-context.tsx` (extend)

Add `refreshUser(): Promise<void>` to `AuthContextValue`:

- Calls `getCurrentUser(token)`.
- On success, updates `state.user` and `sessionStorage` (same `USER_KEY` write path as `login`).
- No-ops if there's no token (shouldn't happen since the dialog is only reachable behind `PrivateRoute`).

## 5. `new-transfer-modal.tsx` rework

### Wizard state

Lift shared state into `NewTransferDialog`:

```ts
const [currentStep, setCurrentStep] = useState(1);
const [recipient, setRecipient] = useState<TransferRecipient | null>(null);
const [amount, setAmount] = useState<string>(""); // raw decimal string, e.g. "200.00"
```

Passed down to each step via props. `Dialog`'s `onOpenChange` resets all three (`currentStep` → 1, `recipient` → null, `amount` → "") when the dialog closes, so reopening always starts fresh.

### Steps array

Add a 4th step and change the grid from `grid-cols-3` to `grid-cols-4`:

```ts
const steps = [
  { id: 1, name: "Set Account" },
  { id: 2, name: "Set Value" },
  { id: 3, name: "Confirm" },
  { id: 4, name: "Done" },
] as const;
```

### Step 1 — `SearchAccount`

- On submit, call `getUserByEmail(accountEmail, token)` (token from `useAuth()`).
- Loading state disables the Search button while in flight.
- On success with a result: call `goNext(user)` (parent stores `recipient`, advances to step 2).
- On success with `null` (not found): `toast.error("No account found with that email")`. Stay on step 1.
- On thrown error (network/API): `toast.error(err instanceof Error ? err.message : "Search failed")`.
- Remove the hardcoded `<dl>` list of fake users.

### Step 2 — `SetValue`

- Unchanged validation (regex requiring 2 decimals).
- On submit, call `goNext(value)` so the parent stores `amount` and advances.
- Replace the hardcoded "Samuel Guedes" recipient card with the real `recipient` passed in as a prop.

### Step 3 — `Confirm`

- Show real `recipient` name/email and `amount` formatted via `formatMoney(Math.round(Number(amount) * 100))`.
- "Confirm" button calls `createTransaction({ amount: Math.round(Number(amount) * 100), userId: recipient.id }, token)`.
  - Loading state disables both buttons while in flight.
  - On success: call `refreshUser()` (from `useAuth()`) then `goNext()` to step 4.
  - On error: `toast.error(err instanceof Error ? err.message : "Transfer failed")`, stay on step 3, allow retry or "Edit value" to go back.

### Step 4 — `Success` (new)

- Simple confirmation: success icon/message, brief summary (amount sent to recipient), and a "Done" button.
- "Done" closes the dialog (via `DialogClose` or controlled `open` state), which triggers the existing reset-on-close logic.

## Error display convention

Use `toast.error(...)` from `sonner`, matching the existing convention in [src/components/login-form.tsx](../../../src/components/login-form.tsx) (`toast.error(err instanceof Error ? err.message : "...")`). No inline banner — errors surface as a toast, and the wizard stays on the current step so the user can retry.

## Testing

- Manual verification (per repo convention, e.g. `/verify` skill or running the dev server) since this is a UI flow against a real backend:
  - Search existing email → advances with real name/email shown in steps 2-3.
  - Search non-existent email → "not found" toast, stays on step 1.
  - Complete transfer → step 4 shown, dashboard balance updates after closing dialog.
  - Attempt transfer that fails server-side (e.g. insufficient balance) → error toast on step 3, can retry.
  - Close dialog mid-wizard and reopen → resets to step 1.

## Known follow-ups (found during manual verification)

- `createTransaction` on the backend inserts a "pending" transaction and settles the balance asynchronously via an Oban worker (`monex_api/lib/monex/operations.ex`, `lib/monex/operations/worker.ex`). `refreshUser()` is called immediately after the mutation resolves, with no guarantee the worker has finished. In testing the worker settled in well under a second, but under load the displayed balance could be stale until a later refresh. Pre-existing backend behavior; not fixed here. A future fix would need polling, a subscription, or having the mutation await settlement.

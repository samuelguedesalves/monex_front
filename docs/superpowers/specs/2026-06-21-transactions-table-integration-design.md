# Transactions Table Integration — Design

## Goal

Wire up `TransactionsTable` ([src/components/transactions-table.tsx](../../../src/components/transactions-table.tsx)) to the real `transactionsFromUser` GraphQL query instead of the hardcoded mock in [src/services/transactions.ts](../../../src/services/transactions.ts), with working pagination and a live refresh after a successful transfer.

## API reference (from monex_api)

- `query transactionsFromUser(page: Int!): TransactionsPagination` — authenticated. Returns:
  ```
  { transactions: [Transaction], page, previousPage, nextPage, quantity }
  ```
- `Transaction`: `{ id: Int, amount: Int, fromUser: Int, toUser: Int, processedAt: DateTime, status: String }`. `fromUser`/`toUser` are raw user IDs — there is no name-resolution query for an arbitrary user ID (only `userByEmail`), so the UI cannot show counterparty names.
- `status` is one of `pending`, `processing`, `done`, `refuse` (`monex_api/lib/monex/operations/transaction.ex`, `priv/repo/migrations/20260524150000_add_status_to_transactions.exs`).
- Pagination is page-based with a **fixed, backend-side page size of 10** (`monex_api/lib/monex/operations.ex:73`, not returned in the response). `quantity` is the count of items on the *current* page (not a total). `nextPage`/`previousPage` are computed unconditionally (`page + 1`, `max(page - 1, 1)`) — they don't reflect whether more pages actually exist. The frontend must infer "has next page" itself: true when `quantity === 10`.
- `amount` is an integer in cents, same convention as the rest of the app.

## 1. `src/services/transaction.ts` (extend)

Add to the existing real service file (already has the `gqlRequest` helper and `Transaction` type from the transfer-modal integration):

```ts
export type Transaction = {
  id: number;
  amount: number;
  fromUser: number;
  toUser: number;
  processedAt: string;
  status: string; // add to existing type
};

export type TransactionsPage = {
  transactions: Transaction[];
  page: number;
  previousPage: number;
  nextPage: number;
  quantity: number;
};

export async function listTransactionsFromUser(
  page: number,
  token: string
): Promise<TransactionsPage>;
```

Implementation follows the same shape as `getUserByEmail`/`createTransaction`: a `TRANSACTIONS_FROM_USER_QUERY` string, called through `gqlRequest`, unwrapping `data.transactionsFromUser`.

## 2. `src/services/transactions.ts` (delete)

The mock file is only imported by `TransactionsTable`, which this change switches to the real service. No other consumers — safe to delete outright rather than leave unused.

## 3. `TransactionsTable` rework

### State

```ts
const PAGE_SIZE = 10;

const [page, setPage] = useState(1);
const [transactions, setTransactions] = useState<Transaction[]>([]);
const [quantity, setQuantity] = useState(0);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);
```

### Fetching

- `useEffect` depends on `[page, refreshKey, token]`, calls `listTransactionsFromUser(page, token!)`.
- Sets `loading` true before the call, `false` in a `finally`.
- On success: store `transactions` and `quantity`, clear `error`.
- On failure: `setError(err instanceof Error ? err.message : "Failed to load transactions")`, keep prior `transactions` cleared (don't show stale data next to an error).
- A separate `useEffect` on `[refreshKey]` resets `page` to `1` when `refreshKey` changes (so a completed transfer always brings the user back to the page showing the newest transaction). Since the fetch effect also depends on `refreshKey`, this guarantees a refetch even when `page` was already `1`.

### Rendering (`TableBody`)

Single-row fallback content spans all columns (`colSpan={5}`, see column list below), matching the lightweight inline-fallback convention already used elsewhere (e.g. `Summary`'s `"N/A"` balance fallback) rather than a dedicated skeleton/spinner component (none exists in this codebase):

- `loading` → row with "Loading transactions…".
- `error` (and not loading) → row with the error message and a "Retry" button. The fetch logic is extracted into a plain `async function fetchTransactions()` defined in the component body (capturing `page`/`refreshKey`/`token` via closure); the `useEffect` calls it on dependency change, and the Retry button's `onClick` calls it directly.
- not loading, no error, `transactions.length === 0` → row with "No transactions yet.".
- otherwise → one row per transaction.

### Columns

| Column | Content |
|---|---|
| ID | `transaction.id` |
| Status | `transaction.status`, capitalized (e.g. `"pending"` → `"Pending"`) via a small helper — no color-coding |
| Details | `` `From: ${transaction.fromUser} → To: ${transaction.toUser}` `` — raw IDs, no direction inference, no name lookup (none available) |
| Date | `transaction.processedAt` formatted with `new Date(...).toLocaleString()` — new column, not in the old mock, added because `processedAt` is part of the real data being fetched |
| Amount | `formatMoney(transaction.amount)`, right-aligned (unchanged from current styling) |

### Pagination footer

Replace the static `TransactionPagination` (hardcoded page links 1/2/3 + ellipsis) with a minimal Previous/Next control, since the backend never reports a total:

- "Previous": disabled when `page <= 1` or `loading`; `onClick` → `setPage((p) => Math.max(1, p - 1))`.
- "Next": disabled when `loading` or `quantity < PAGE_SIZE`; `onClick` → `setPage((p) => p + 1)`.
- Drop the numbered `PaginationLink`/`PaginationEllipsis` usage entirely — show current page as plain text (e.g. `Page {page}`) between the two buttons instead.
- Buttons disabled during `loading` doubles as a simple guard against overlapping requests from rapid clicks — no need for request cancellation/race-condition handling beyond that.

## 4. Cross-component refresh wiring

### `new-transfer-modal.tsx`

- `NewTransferDialog` gains an optional prop: `onTransferComplete?: VoidFunction`.
- Threaded down to the `Confirm` step as a new prop.
- In `Confirm`'s `handleConfirm`, call `onTransferComplete?.()` immediately after the existing `await refreshUser()` (same success path, before `goNext()`).

### `dashboard.tsx`

- `Dashboard` owns `const [refreshKey, setRefreshKey] = useState(0)`.
- Passes `onTransferComplete={() => setRefreshKey((k) => k + 1)}` down through `Summary` (which renders `<NewTransferDialog />`) — `Summary` gains the same optional prop and forwards it.
- Passes `refreshKey` to `<TransactionsTable refreshKey={refreshKey} />`.
- `TransactionsTable` accepts `refreshKey?: number` (default `0`), used purely as a `useEffect` dependency trigger as described above.

## Error display convention

Inline in the table body (not `toast.error`), since this is passive page content rather than a user-initiated action — consistent with `Summary`'s existing inline `"N/A"` fallback for a missing user. A "Retry" button lets the user recover without reloading the page.

## Testing

Manual verification (no test framework in this repo), per repo convention:

- Load dashboard with existing transactions → table populates, columns render correctly (status capitalized, details show raw IDs, date readable, amount formatted).
- Click "Next" on a user with more than 10 transactions → page 2 loads; "Previous" re-enables.
- Reach the last page (fewer than 10 results) → "Next" disables.
- Trigger an API error (e.g. stop the backend) → inline error row with "Retry"; clicking Retry re-attempts the fetch.
- Complete a transfer via `NewTransferDialog` → after closing the dialog, the transactions table has already reset to page 1 and shows the new transaction (status likely `"pending"`, per the backend's async settlement noted in the transfer-modal integration spec).
- Empty account (no transactions) → "No transactions yet." row, pagination buttons both disabled (page 1, quantity 0 < 10).

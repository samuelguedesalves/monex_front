# Transactions Table Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mocked `TransactionsTable` with one wired to the real `transactionsFromUser` GraphQL query, with working Previous/Next pagination and an automatic refresh after a transfer completes.

**Architecture:** Extend the existing `src/services/transaction.ts` with a `listTransactionsFromUser` call (same `gqlRequest` pattern already used for `getUserByEmail`/`createTransaction`). `TransactionsTable` becomes a self-fetching component (`useState`/`useEffect`, mirroring no existing exact precedent but following the error/loading conventions used elsewhere in the app). A `refreshKey` counter is lifted to `Dashboard` and threaded through `Summary` → `NewTransferDialog` → `Confirm` (to bump it after a successful transfer) and down to `TransactionsTable` (to trigger a refetch + page reset).

**Tech Stack:** React 19, TypeScript, existing GraphQL-over-fetch services, shadcn/ui `Table`/`Pagination`/`Button` primitives, no test framework (manual verification only, per `CLAUDE.md`).

## Global Constraints

- Money values are integer cents; display via `formatMoney()` (`src/lib/numberFormatter.ts`) — no new formatting logic for amounts.
- No GraphQL client library — raw `fetch` POSTs of `{ query, operationName, variables }`, unwrap `json.data`, throw on `json.errors` — follow the exact shape of `gqlRequest` already in `src/services/transaction.ts`.
- Backend page size is a fixed, unreturned constant of 10 (`monex_api/lib/monex/operations.ex:73`) — "has next page" must be inferred client-side as `quantity === 10`, never trust `nextPage`/`previousPage` values as bounds indicators.
- `fromUser`/`toUser` are raw integer IDs with no name-resolution query available — Details column shows raw IDs only, no direction inference, no name lookup.
- Status values are exactly one of `pending`, `processing`, `done`, `refuse` — render as plain capitalized text, no color-coding.
- Errors from passive data loads (not user-initiated actions) render inline in the table, not via `toast.error` — toast is reserved for action errors (e.g. transfer submission), per existing convention in `login-form.tsx` / `new-transfer-modal.tsx`.
- No test framework exists in this repo — every "test" step in this plan is a manual dev-server verification, not automated test code.

---

## File Structure

| File | Change |
|---|---|
| `src/services/transaction.ts` | Modify — add `status` to `Transaction` type, add `TransactionsPage` type, add `listTransactionsFromUser()` |
| `src/services/transactions.ts` | Delete — mock file, only consumer is being rewired |
| `src/components/transactions-table.tsx` | Rewrite — real fetch, loading/error/empty states, Previous/Next pagination, `refreshKey` prop |
| `src/components/new-transfer-modal.tsx` | Modify — `NewTransferDialog` and `Confirm` gain `onTransferComplete?: VoidFunction` |
| `src/pages/dashboard.tsx` | Modify — `Dashboard` owns `refreshKey` state, `Summary` forwards `onTransferComplete` |

---

## Task 1: Extend `transaction.ts` service with `listTransactionsFromUser`

**Files:**
- Modify: `src/services/transaction.ts`

**Interfaces:**
- Consumes: existing `gqlRequest<T>(query, operationName, variables, token)` helper already defined in this file (lines 41-67).
- Produces:
  - `Transaction` type now includes `status: string`.
  - `export type TransactionsPage = { transactions: Transaction[]; page: number; previousPage: number; nextPage: number; quantity: number }`
  - `export async function listTransactionsFromUser(page: number, token: string): Promise<TransactionsPage>`

- [ ] **Step 1: Add `status` to the `Transaction` type**

In `src/services/transaction.ts`, find:

```ts
export type Transaction = {
  id: number;
  amount: number;
  fromUser: number;
  toUser: number;
  processedAt: string;
};
```

Replace with:

```ts
export type Transaction = {
  id: number;
  amount: number;
  fromUser: number;
  toUser: number;
  processedAt: string;
  status: string;
};
```

- [ ] **Step 2: Add the query string and `TransactionsPage` type**

Immediately after the existing `CREATE_TRANSACTION_MUTATION` constant (after its closing `` ` ``), add:

```ts
const TRANSACTIONS_FROM_USER_QUERY = `
  query transactionsFromUser($page: Int!) {
    transactionsFromUser(page: $page) {
      transactions {
        id
        amount
        fromUser
        toUser
        processedAt
        status
      }
      page
      previousPage
      nextPage
      quantity
    }
  }
`;
```

After the `Transaction` type definition, add:

```ts
export type TransactionsPage = {
  transactions: Transaction[];
  page: number;
  previousPage: number;
  nextPage: number;
  quantity: number;
};
```

- [ ] **Step 3: Add `listTransactionsFromUser`**

At the end of `src/services/transaction.ts`, after `createTransaction`, add:

```ts
export async function listTransactionsFromUser(
  page: number,
  token: string
): Promise<TransactionsPage> {
  const data = await gqlRequest<{ transactionsFromUser: TransactionsPage }>(
    TRANSACTIONS_FROM_USER_QUERY,
    "transactionsFromUser",
    { page },
    token
  );

  return data.transactionsFromUser;
}
```

- [ ] **Step 4: Type-check**

Run: `bun run build`
Expected: no TypeScript errors. (This will currently still pass even though `transactions-table.tsx` hasn't been updated yet, since that file doesn't reference the new exports.)

- [ ] **Step 5: Commit**

```bash
git add src/services/transaction.ts
git commit -m "feat: add listTransactionsFromUser to transaction service"
```

---

## Task 2: Delete the mock transactions service

**Files:**
- Delete: `src/services/transactions.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing — this task only removes dead code. `transactions-table.tsx` still imports from it until Task 3, so this task is sequenced immediately before Task 3 and the two should be reviewed together if anything breaks the build in between.

- [ ] **Step 1: Delete the file**

```bash
git rm src/services/transactions.ts
```

- [ ] **Step 2: Confirm no other references remain**

Run: `grep -rn "services/transactions\"" src/`
Expected: no output (only `transactions-table.tsx` referenced it, and Task 3 rewrites that import in the same logical change — if you're executing tasks strictly in order, the build will be red between Task 2 and Task 3's completion; that's expected and resolved by Task 3, Step 1).

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: remove mock transactions service"
```

---

## Task 3: Rewrite `TransactionsTable` against the real API

**Files:**
- Modify: `src/components/transactions-table.tsx`

**Interfaces:**
- Consumes:
  - `listTransactionsFromUser(page: number, token: string): Promise<TransactionsPage>` and `type Transaction` from `@/services/transaction` (Task 1).
  - `useAuth()` from `@/contexts/auth-context`, returning `{ user, token, login, logout, refreshUser }`.
  - `formatMoney(value: number): string` from `@/lib/numberFormatter`.
- Produces: `export function TransactionsTable({ refreshKey }: { refreshKey?: number })` — consumed by `Dashboard` in Task 5.

- [ ] **Step 1: Replace the full contents of `src/components/transactions-table.tsx`**

```tsx
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";
import { formatMoney } from "@/lib/numberFormatter";
import {
  listTransactionsFromUser,
  type Transaction,
} from "@/services/transaction";
import { useEffect, useState } from "react";

const PAGE_SIZE = 10;
const COLUMN_COUNT = 5;

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

type TransactionsTableProps = {
  refreshKey?: number;
};

export function TransactionsTable({ refreshKey = 0 }: TransactionsTableProps) {
  const { token } = useAuth();
  const [page, setPage] = useState(1);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [quantity, setQuantity] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchTransactions() {
    setLoading(true);
    setError(null);
    try {
      const result = await listTransactionsFromUser(page, token!);
      setTransactions(result.transactions);
      setQuantity(result.quantity);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load transactions"
      );
      setTransactions([]);
      setQuantity(0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (refreshKey > 0 && page !== 1) {
      setPage(1);
      return;
    }
    fetchTransactions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, refreshKey]);

  const hasPrevious = page > 1;
  const hasNext = quantity === PAGE_SIZE;

  return (
    <Table>
      <TableCaption>A list of your recent transactions.</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[100px]">ID</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Details</TableHead>
          <TableHead>Date</TableHead>
          <TableHead className="text-right">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading && (
          <TableRow>
            <TableCell colSpan={COLUMN_COUNT} className="text-center">
              Loading transactions…
            </TableCell>
          </TableRow>
        )}
        {!loading && error && (
          <TableRow>
            <TableCell colSpan={COLUMN_COUNT} className="text-center">
              <div className="flex items-center justify-center gap-x-2">
                <span>{error}</span>
                <Button variant="secondary" size="sm" onClick={fetchTransactions}>
                  Retry
                </Button>
              </div>
            </TableCell>
          </TableRow>
        )}
        {!loading && !error && transactions.length === 0 && (
          <TableRow>
            <TableCell colSpan={COLUMN_COUNT} className="text-center">
              No transactions yet.
            </TableCell>
          </TableRow>
        )}
        {!loading &&
          !error &&
          transactions.map((transaction) => (
            <TableRow key={transaction.id}>
              <TableCell className="font-medium">{transaction.id}</TableCell>
              <TableCell>{capitalize(transaction.status)}</TableCell>
              <TableCell>
                From: {transaction.fromUser} → To: {transaction.toUser}
              </TableCell>
              <TableCell>
                {new Date(transaction.processedAt).toLocaleString()}
              </TableCell>
              <TableCell className="text-right">
                {formatMoney(transaction.amount)}
              </TableCell>
            </TableRow>
          ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={COLUMN_COUNT}>
            <div className="flex items-center justify-center gap-x-4">
              <Button
                variant="secondary"
                size="sm"
                disabled={!hasPrevious || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span>Page {page}</span>
              <Button
                variant="secondary"
                size="sm"
                disabled={!hasNext || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}
```

Note on the `refreshKey` effect: when `refreshKey` increments while the user is on a page other than 1, the effect's first branch resets `page` to 1 and returns early — the resulting `page` change re-triggers the effect on the next render, which then falls through to `fetchTransactions()`. When `refreshKey` increments while already on page 1, the first branch's condition (`page !== 1`) is false, so it falls through to `fetchTransactions()` directly in the same run. Either path ends in exactly one fetch for page 1.

This also replaces the old `TransactionPagination` export — it's removed entirely (it was unused outside this file: confirm with `grep -rn "TransactionPagination" src/` before deleting if executing out of order).

- [ ] **Step 2: Type-check**

Run: `bun run build`
Expected: no TypeScript errors.

- [ ] **Step 3: Manual verification — start the dev server**

Run: `bun run dev`

With the `monex_api` backend running and a logged-in session that has at least one transaction:
- Confirm the table loads and shows real rows (not the old mock `INV001`-style IDs).
- Confirm Status shows capitalized text (e.g. "Pending", "Done").
- Confirm Details shows `From: <id> → To: <id>`.
- Confirm Date shows a readable timestamp.
- Confirm Amount is formatted as currency and right-aligned.

- [ ] **Step 4: Manual verification — pagination**

If the test account has more than 10 transactions: click "Next", confirm page 2 loads different rows and "Previous" becomes enabled; click "Previous", confirm it returns to page 1 and disables again. If the account has 10 or fewer transactions, confirm "Next" is disabled on page 1.

- [ ] **Step 5: Manual verification — error state**

Stop the `monex_api` backend, reload the dashboard page. Confirm the table shows an inline error message with a "Retry" button instead of crashing the page. Restart the backend, click "Retry", confirm the table recovers and shows data.

- [ ] **Step 6: Commit**

```bash
git add src/components/transactions-table.tsx
git commit -m "feat: wire TransactionsTable to transactionsFromUser query"
```

---

## Task 4: Add `onTransferComplete` callback to the transfer dialog

**Files:**
- Modify: `src/components/new-transfer-modal.tsx`

**Interfaces:**
- Consumes: existing `Confirm` component's `handleConfirm` flow (calls `createTransaction` then `refreshUser()` then `goNext()`).
- Produces: `NewTransferDialog` now accepts an optional prop `onTransferComplete?: VoidFunction`, invoked exactly once per successful transfer, after `refreshUser()` resolves and before `goNext()` runs. Consumed by `Dashboard`/`Summary` in Task 5.

- [ ] **Step 1: Add the prop to `NewTransferDialog`**

In `src/components/new-transfer-modal.tsx`, find:

```tsx
export function NewTransferDialog() {
```

Replace with:

```tsx
type NewTransferDialogProps = {
  onTransferComplete?: VoidFunction;
};

export function NewTransferDialog({
  onTransferComplete,
}: NewTransferDialogProps) {
```

- [ ] **Step 2: Thread the prop down to `Confirm`**

Find the `currentStep === 3` block:

```tsx
        {currentStep === 3 && (
          <Confirm
            recipient={recipient!}
            amount={amount}
            goNext={() => setCurrentStep(4)}
            goPrevious={() => setCurrentStep(2)}
          />
        )}
```

Replace with:

```tsx
        {currentStep === 3 && (
          <Confirm
            recipient={recipient!}
            amount={amount}
            goNext={() => setCurrentStep(4)}
            goPrevious={() => setCurrentStep(2)}
            onTransferComplete={onTransferComplete}
          />
        )}
```

- [ ] **Step 3: Accept and call the prop inside `Confirm`**

Find:

```tsx
function Confirm({
  recipient,
  amount,
  goNext,
  goPrevious,
}: {
  recipient: TransferRecipient;
  amount: string;
  goNext: VoidFunction;
  goPrevious: VoidFunction;
}) {
```

Replace with:

```tsx
function Confirm({
  recipient,
  amount,
  goNext,
  goPrevious,
  onTransferComplete,
}: {
  recipient: TransferRecipient;
  amount: string;
  goNext: VoidFunction;
  goPrevious: VoidFunction;
  onTransferComplete?: VoidFunction;
}) {
```

Find, inside `handleConfirm`:

```tsx
      // Transaction settlement happens async on the backend (Oban worker), so
      // this may briefly show the pre-transfer balance under load.
      await refreshUser();
      goNext();
```

Replace with:

```tsx
      // Transaction settlement happens async on the backend (Oban worker), so
      // this may briefly show the pre-transfer balance under load.
      await refreshUser();
      onTransferComplete?.();
      goNext();
```

- [ ] **Step 4: Type-check**

Run: `bun run build`
Expected: no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/new-transfer-modal.tsx
git commit -m "feat: add onTransferComplete callback to NewTransferDialog"
```

---

## Task 5: Wire `Dashboard` refresh state end-to-end

**Files:**
- Modify: `src/pages/dashboard.tsx`

**Interfaces:**
- Consumes:
  - `NewTransferDialog({ onTransferComplete }: { onTransferComplete?: VoidFunction })` (Task 4).
  - `TransactionsTable({ refreshKey }: { refreshKey?: number })` (Task 3).
- Produces: none (top of the tree for this feature).

- [ ] **Step 1: Replace the full contents of `src/pages/dashboard.tsx`**

```tsx
import { Container } from "@/components/container";
import { NewTransferDialog } from "@/components/new-transfer-modal";
import { TransactionsTable } from "@/components/transactions-table";
import { useAuth } from "@/contexts/auth-context";
import { formatMoney } from "@/lib/numberFormatter";
import { useMemo, useState } from "react";

export function Dashboard() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div>
      <Container className="grid grid-cols-1 gap-y-4">
        <Summary onTransferComplete={() => setRefreshKey((k) => k + 1)} />
        <TransactionsTable refreshKey={refreshKey} />
      </Container>
    </div>
  );
}

function Summary({
  onTransferComplete,
}: {
  onTransferComplete?: VoidFunction;
}) {
  const { user } = useAuth();

  const balance = useMemo(() => {
    if (!user) {
      console.error("[Dashboard / Summary] Error while retrieve user data");
      return "N/A";
    }

    return formatMoney(user.balance);
  }, [user]);

  return (
    <div className="flex justify-between items-center border-2 border-solid ring-1 ring-foreground/10 bg-card text-card-foreground px-8 py-4 rounded-lg">
      <div className="flex justify-between items-center gap-x-4">
        <div>
          <span>Balance</span>
          <p className="text-xl">{balance}</p>
        </div>
      </div>
      <NewTransferDialog onTransferComplete={onTransferComplete} />
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `bun run build`
Expected: no TypeScript errors.

- [ ] **Step 3: Manual verification — end-to-end refresh**

Run: `bun run dev`. On the dashboard:
- Note the current transactions table contents (e.g. the top row's ID, or that page shows "No transactions yet.").
- Open "New Transfer", complete a transfer to a valid recipient through all steps to "Transfer complete".
- Click "Done" to close the dialog.
- Confirm the transactions table now shows the new transaction at the top of page 1 (status likely "Pending"), and that the page indicator reads "Page 1" even if you had navigated to a different page before starting the transfer.

- [ ] **Step 4: Commit**

```bash
git add src/pages/dashboard.tsx
git commit -m "feat: refresh transactions table after a completed transfer"
```

---

## Self-Review Notes

- **Spec coverage:** service extension (Task 1), mock deletion (Task 2), component rewrite with loading/error/empty states + columns + pagination (Task 3), dialog callback (Task 4), Dashboard wiring (Task 5) — all sections of the design doc are covered. No spec section lacks a task.
- **Placeholder scan:** no TBD/TODO/"add appropriate" phrasing; every step has complete code.
- **Type consistency:** `Transaction` (with `status`) and `TransactionsPage` defined in Task 1 are imported with matching names/shapes in Task 3. `onTransferComplete?: VoidFunction` is named identically across `NewTransferDialog`, `Confirm` (Task 4), and `Summary`/`Dashboard` (Task 5). `refreshKey?: number` is named identically in `TransactionsTable` (Task 3) and `Dashboard` (Task 5).

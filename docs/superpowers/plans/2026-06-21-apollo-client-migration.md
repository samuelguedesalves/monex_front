# Apollo Client Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the raw-`fetch` GraphQL boilerplate in `src/services/user.ts` and `src/services/transaction.ts` with a single Apollo Client instance (used via Apollo's React hooks at every call site), plus middleware that auto-logs-out the user when any GraphQL request comes back unauthenticated.

**Architecture:** A singleton `ApolloClient` (`src/lib/apollo-client.ts`) built from three composed links — an `authLink` that reads the token from `sessionStorage` on every request, an `errorLink` that detects the backend's `"unauthenticated"` GraphQL error and clears storage + hard-redirects to `/login`, and the `httpLink` that actually sends the request. GraphQL documents and shared types move out of `src/services/*` into a new `src/graphql/*` directory as plain `gql` exports (no fetch logic). Every component that issues a GraphQL operation switches to Apollo's `useQuery`/`useLazyQuery`/`useMutation` hooks; `AuthProvider` is the one place hooks are called on behalf of imperative consumers (`login`/`logout`/`refreshUser` keep their existing signatures).

**Tech Stack:** React 19, TypeScript, `@apollo/client` (new), `graphql` (new), `react-router` v7, existing `react-hook-form`/`zod`/`sonner`.

## Global Constraints

- Package manager is **bun** — use `bun add`, not `npm`/`yarn`.
- Money values are integer cents everywhere; no change to that convention in this migration.
- No test framework exists in this repo — verification is `bun run build` (type-check) plus manual exercise of the feature, per repo convention.
- 401 detection matches on a GraphQL error with `message === "unauthenticated"` — the backend (`monex_api`) always returns HTTP 200, never a real 401 status code.
- **`@apollo/client` v4 is installed (not v3)** — its link and hook APIs differ from older Apollo Client tutorials/docs. Use exactly the v4 APIs shown in each task's code: `SetContextLink`/`ErrorLink` classes (not the deprecated `setContext`/`onError` functions), `CombinedGraphQLErrors.is(error)` for error inspection (not destructuring `graphQLErrors`/`networkError`), a non-generic `ApolloClient` (no `<NormalizedCacheObject>` type parameter), and `useQuery`/`useLazyQuery`/`useMutation`/`ApolloProvider` imported from `@apollo/client/react` (not the top-level `@apollo/client` package — only `gql`, `ApolloClient`, `InMemoryCache`, `HttpLink` live there).
- `sessionStorage` keys are the literals `"auth_token"` and `"auth_user"` (must match `auth-context.tsx`'s `TOKEN_KEY`/`USER_KEY` constants exactly).
- Path alias `@/*` → `src/*` is already configured; use it in all new imports.

---

### Task 1: Install Apollo Client and create the singleton client module

**Files:**
- Modify: `package.json` (via `bun add`)
- Create: `src/lib/apollo-client.ts`

**Interfaces:**
- Produces: `export const apolloClient: ApolloClient` — the singleton instance every later task imports from `@/lib/apollo-client`.

- [ ] **Step 1: Install dependencies**

```bash
bun add @apollo/client graphql
```

Expected: `package.json` dependencies gain `@apollo/client` (v4.x) and `graphql`; `bun.lock` updates.

- [ ] **Step 2: Create the Apollo Client module**

Create `src/lib/apollo-client.ts`. This uses the Apollo Client **v4** link API — `SetContextLink` and `ErrorLink` classes, not the deprecated `setContext`/`onError` functions, and `CombinedGraphQLErrors.is(error)` for error inspection (not destructured `graphQLErrors`):

```ts
import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";
import { SetContextLink } from "@apollo/client/link/context";
import { ErrorLink } from "@apollo/client/link/error";
import { CombinedGraphQLErrors } from "@apollo/client/errors";

const TOKEN_KEY = "auth_token";
const USER_KEY = "auth_user";

const httpLink = new HttpLink({
  uri: import.meta.env.VITE_API_URL ?? "http://localhost:4000/api",
});

const authLink = new SetContextLink((prevContext) => {
  const token = sessionStorage.getItem(TOKEN_KEY);
  return {
    headers: {
      ...prevContext.headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };
});

const errorLink = new ErrorLink(({ error }) => {
  const isUnauthenticated =
    CombinedGraphQLErrors.is(error) &&
    error.errors.some((e) => e.message === "unauthenticated");
  if (isUnauthenticated) {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    window.location.href = "/login";
  }
});

export const apolloClient = new ApolloClient({
  link: errorLink.concat(authLink).concat(httpLink),
  cache: new InMemoryCache(),
});
```

- [ ] **Step 3: Type-check**

Run: `bun run build`
Expected: succeeds (no consumers yet, so this only validates `apollo-client.ts` itself compiles).

- [ ] **Step 4: Commit**

```bash
git add package.json bun.lock src/lib/apollo-client.ts
git commit -m "feat: add Apollo Client singleton with auth and 401 links"
```

---

### Task 2: Wire ApolloProvider into the app root

**Files:**
- Modify: `src/main.tsx`

**Interfaces:**
- Consumes: `apolloClient` from `@/lib/apollo-client` (Task 1).

- [ ] **Step 1: Wrap the router in ApolloProvider**

In `src/main.tsx`, add the import and wrap `RouterProvider`:

```tsx
import { createRoot } from "react-dom/client";
import "./index.css";
import { createBrowserRouter, Outlet, RouterProvider } from "react-router";
import { ApolloProvider } from "@apollo/client/react";
import { Login } from "@/pages/login";
import { Header } from "@/components/header";
import { Dashboard } from "@/pages/dashboard";
import { AuthProvider } from "@/contexts/auth-context";
import { PrivateRoute } from "@/components/private-route";
import { Toaster } from "@/components/ui/sonner";
import { apolloClient } from "@/lib/apollo-client";

function RootLayout() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}

function PublicLayout() {
  return (
    <>
      <Header variant="simple" />
      <Outlet />
    </>
  );
}

function PrivateLayout() {
  return (
    <>
      <Header variant="logged" />
      <Outlet />
    </>
  );
}

const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      {
        element: <PublicLayout />,
        children: [
          {
            path: "/login",
            element: <Login />,
          },
        ],
      },
      {
        element: <PrivateRoute />,
        children: [
          {
            element: <PrivateLayout />,
            children: [
              {
                path: "/",
                element: <Dashboard />,
              },
            ],
          },
        ],
      },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <div className="font-display">
    <ApolloProvider client={apolloClient}>
      <RouterProvider router={router} />
    </ApolloProvider>
    <Toaster />
  </div>,
);
```

- [ ] **Step 2: Type-check**

Run: `bun run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/main.tsx
git commit -m "feat: wrap app router in ApolloProvider"
```

---

### Task 3: Create `src/graphql/user.ts` and migrate `auth-context.tsx` to Apollo hooks

**Files:**
- Create: `src/graphql/user.ts`
- Modify: `src/contexts/auth-context.tsx`
- Delete: `src/services/user.ts`

**Interfaces:**
- Produces: `AUTH_USER_MUTATION`, `CURRENT_USER_QUERY` (gql documents), `AuthUser`, `AuthResult` types — exported from `@/graphql/user` for use by any future consumer.
- Consumes: `apolloClient` indirectly via Apollo's `useMutation`/`useLazyQuery` hooks (Task 1/2 must be done — `ApolloProvider` must wrap the tree for these hooks to work).

- [ ] **Step 1: Create `src/graphql/user.ts`**

```ts
import { gql } from "@apollo/client";

export const AUTH_USER_MUTATION = gql`
  mutation authUser($email: String!, $password: String!) {
    authUser(input: { email: $email, password: $password }) {
      user {
        id
        firstName
        lastName
        email
        balance
      }
      token
    }
  }
`;

export const CURRENT_USER_QUERY = gql`
  query currentUser {
    user {
      id
      firstName
      lastName
      email
      balance
    }
  }
`;

export type AuthUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  balance: number;
};

export type AuthResult = {
  user: AuthUser;
  token: string;
};
```

- [ ] **Step 2: Rewrite `src/contexts/auth-context.tsx` to use Apollo hooks**

Replace the full file contents:

```tsx
import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router";
import { useMutation, useLazyQuery } from "@apollo/client/react";
import {
  AUTH_USER_MUTATION,
  CURRENT_USER_QUERY,
  type AuthUser,
} from "@/graphql/user";

const TOKEN_KEY = "auth_token";
const USER_KEY = "auth_user";

type AuthState = {
  user: AuthUser | null;
  token: string | null;
};

type AuthContextValue = AuthState & {
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [state, setState] = useState<AuthState>(() => {
    try {
      const token = sessionStorage.getItem(TOKEN_KEY);
      const userRaw = sessionStorage.getItem(USER_KEY);
      if (token && userRaw) {
        return { token, user: JSON.parse(userRaw) as AuthUser };
      }
    } catch {
      // sessionStorage unavailable — fall through to null state
    }
    return { token: null, user: null };
  });

  const [authUserMutation] = useMutation(AUTH_USER_MUTATION);
  const [fetchCurrentUser] = useLazyQuery(CURRENT_USER_QUERY, {
    fetchPolicy: "network-only",
  });

  async function login(email: string, password: string) {
    const { data } = await authUserMutation({ variables: { email, password } });
    if (!data?.authUser) {
      throw new Error("Authentication failed");
    }
    const { user, token } = data.authUser;
    try {
      sessionStorage.setItem(TOKEN_KEY, token);
      sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch {
      // sessionStorage unavailable — continue with in-memory only
    }
    setState({ user, token });
    navigate("/");
  }

  function logout() {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);
    } catch {
      // sessionStorage unavailable
    }
    setState({ user: null, token: null });
    navigate("/login");
  }

  async function refreshUser() {
    if (!state.token) {
      return;
    }
    const { data } = await fetchCurrentUser();
    if (!data?.user) {
      throw new Error("Failed to load current user");
    }
    const user = data.user;
    try {
      sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch {
      // sessionStorage unavailable — continue with in-memory only
    }
    setState((prev) => ({ ...prev, user }));
  }

  return (
    <AuthContext.Provider value={{ ...state, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return ctx;
}
```

- [ ] **Step 3: Delete the old service file**

```bash
rm src/services/user.ts
```

- [ ] **Step 4: Type-check**

Run: `bun run build`
Expected: succeeds. (If it fails on a leftover import elsewhere, that import will be fixed in Tasks 4–5 — confirm the only remaining references are in `transactions-table.tsx` and `new-transfer-modal.tsx`, which are out of scope for this task.)

- [ ] **Step 5: Manual verification**

Run: `bun run dev`, open the app:
- Log in with valid credentials → succeeds, lands on dashboard.
- Log in with invalid credentials → error toast shown (via `LoginForm`'s existing catch block), no crash.
- Reload the dashboard while logged in → `refreshUser` fires without error, balance still displays.

- [ ] **Step 6: Commit**

```bash
git add src/graphql/user.ts src/contexts/auth-context.tsx
git rm src/services/user.ts
git commit -m "feat: migrate auth-context to Apollo hooks"
```

---

### Task 4: Create `src/graphql/transaction.ts` and migrate `TransactionsTable` to `useQuery`

**Files:**
- Create: `src/graphql/transaction.ts`
- Modify: `src/components/transactions-table.tsx`

**Interfaces:**
- Produces: `USER_BY_EMAIL_QUERY`, `CREATE_TRANSACTION_MUTATION`, `TRANSACTIONS_FROM_USER_QUERY` (gql documents), `TransferRecipient`, `Transaction`, `TransactionsPage` types — exported from `@/graphql/transaction`. Task 5 consumes `USER_BY_EMAIL_QUERY`, `CREATE_TRANSACTION_MUTATION`, and `TransferRecipient` from this same file.
- Consumes: `apolloClient` indirectly via `useQuery` (Tasks 1/2).

- [ ] **Step 1: Create `src/graphql/transaction.ts`**

```ts
import { gql } from "@apollo/client";

export const USER_BY_EMAIL_QUERY = gql`
  query userByEmail($email: String!) {
    userByEmail(email: $email) {
      id
      firstName
      lastName
      email
    }
  }
`;

export const CREATE_TRANSACTION_MUTATION = gql`
  mutation createTransaction($amount: Int!, $userId: Int!) {
    createTransaction(input: { amount: $amount, userId: $userId }) {
      id
      amount
      fromUser
      toUser
      processedAt
    }
  }
`;

export const TRANSACTIONS_FROM_USER_QUERY = gql`
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
  status: string;
};

export type TransactionsPage = {
  transactions: Transaction[];
  page: number;
  previousPage: number;
  nextPage: number;
  quantity: number;
};
```

Note: `src/services/transaction.ts` is **not** deleted in this task, even though nothing in this task still uses it after Step 2 — `new-transfer-modal.tsx` (Task 5) still imports `getUserByEmail`/`createTransaction`/`TransferRecipient` from it until Task 5 replaces those imports with `@/graphql/transaction`. Deleting it here would leave Task 5's starting state with a broken import. It is deleted at the end of Task 5 once that file no longer references it.

- [ ] **Step 2: Rewrite `src/components/transactions-table.tsx`**

Replace the full file contents:

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
import { useQuery } from "@apollo/client/react";
import {
  TRANSACTIONS_FROM_USER_QUERY,
  type TransactionsPage,
} from "@/graphql/transaction";
import { useEffect, useRef, useState } from "react";

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
  const previousRefreshKey = useRef(refreshKey);

  const { data, loading, error, refetch } = useQuery<{
    transactionsFromUser: TransactionsPage;
  }>(TRANSACTIONS_FROM_USER_QUERY, {
    variables: { page },
    skip: !token,
    fetchPolicy: "network-only",
  });

  useEffect(() => {
    if (refreshKey !== previousRefreshKey.current) {
      previousRefreshKey.current = refreshKey;
      if (page !== 1) {
        setPage(1);
        return;
      }
      refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const transactions = data?.transactionsFromUser.transactions ?? [];
  const quantity = data?.transactionsFromUser.quantity ?? 0;
  const errorMessage = error
    ? error.message || "Failed to load transactions"
    : null;

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
        {!loading && errorMessage && (
          <TableRow>
            <TableCell colSpan={COLUMN_COUNT} className="text-center">
              <div className="flex items-center justify-center gap-x-2">
                <span>{errorMessage}</span>
                <Button variant="secondary" size="sm" onClick={() => refetch()}>
                  Retry
                </Button>
              </div>
            </TableCell>
          </TableRow>
        )}
        {!loading && !errorMessage && transactions.length === 0 && (
          <TableRow>
            <TableCell colSpan={COLUMN_COUNT} className="text-center">
              No transactions yet.
            </TableCell>
          </TableRow>
        )}
        {!loading &&
          !errorMessage &&
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

Note on `fetchPolicy: "network-only"`: the original code always refetched on `page`/`refreshKey` change with no caching layer at all (raw `fetch` every time). `network-only` preserves that always-hits-the-network behavior while still letting Apollo populate the cache; without it, Apollo's default `cache-first` policy could serve a stale page from cache after a transfer changes server state, which the original code never had a chance to do.

- [ ] **Step 3: Type-check**

Run: `bun run build`
Expected: succeeds.

- [ ] **Step 4: Manual verification**

Run: `bun run dev`, open the dashboard while logged in with an account that has transactions:
- Table populates with existing transactions, columns render as before (capitalized status, raw-ID details, formatted date/amount).
- Click "Next" (if more than 10 transactions exist) → page 2 loads, "Previous" enables.
- Click "Previous" → back to page 1.
- Stop the backend, click "Retry" or reload → inline error row appears with a "Retry" button; restart the backend, click "Retry" → table recovers.

- [ ] **Step 5: Commit**

```bash
git add src/graphql/transaction.ts src/components/transactions-table.tsx
git commit -m "feat: migrate TransactionsTable to Apollo useQuery"
```

---

### Task 5: Migrate `new-transfer-modal.tsx` to Apollo hooks and delete the old transaction service

**Files:**
- Modify: `src/components/new-transfer-modal.tsx`
- Delete: `src/services/transaction.ts`

**Interfaces:**
- Consumes: `USER_BY_EMAIL_QUERY`, `CREATE_TRANSACTION_MUTATION`, `TransferRecipient` from `@/graphql/transaction` (Task 4).

- [ ] **Step 1: Update imports in `new-transfer-modal.tsx`**

Replace lines 1–38 (the import block) — specifically replace:

```ts
import {
  getUserByEmail,
  createTransaction,
  type TransferRecipient,
} from "@/services/transaction";
```

with:

```ts
import { useLazyQuery, useMutation } from "@apollo/client/react";
import {
  USER_BY_EMAIL_QUERY,
  CREATE_TRANSACTION_MUTATION,
  type TransferRecipient,
} from "@/graphql/transaction";
```

(Leave every other import in that block — `Button`, `Dialog*`, `Field*`, `Input`, `Label`, `Controller`/`useForm`/`SubmitHandler`, `z`, `zodResolver`, the `lucide-react` icons, `Separator`, `useState`, `cn`, `useAuth`, `formatMoney`, `toast` — unchanged.)

- [ ] **Step 2: Update `SearchAccount` to use `useLazyQuery`**

Replace the `SearchAccount` function body:

```tsx
function SearchAccount({ goNext }: SearchAccountProps) {
  const [searchUser] = useLazyQuery<{
    userByEmail: TransferRecipient | null;
  }>(USER_BY_EMAIL_QUERY);
  const form = useForm<findUserFormData>({
    resolver: zodResolver(findUserFormSchema),
    defaultValues: {
      accountEmail: "",
    },
  });

  const onSubmit: SubmitHandler<findUserFormData> = async (data) => {
    try {
      const { data: result } = await searchUser({
        variables: { email: data.accountEmail },
      });
      const user = result?.userByEmail;
      if (!user) {
        throw new Error(
          "[NewTransferModal / SearchAccount] error to retrieve receiver user data",
        );
      }
      goNext(user);
    } catch (err) {
      console.error(err);
      form.setError("accountEmail", {
        message: "No account found with that email",
      });
    }
  };

  return (
    <div className="flex flex-col gap-y-4">
      <div className="flex flex-col gap-y-2">
        <p className="text-base leading-none font-medium">
          Set transfer account
        </p>
        <p className="text-muted-foreground">
          Search receiver account by email
        </p>
      </div>
      <form
        id="new-transfer"
        onSubmit={form.handleSubmit(onSubmit)}
        className="grid grid-cols-1 gap-y-4"
      >
        <FieldGroup className="">
          <Controller
            name="accountEmail"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field>
                <Label htmlFor={field.name}>Account Email</Label>
                <Input {...field} />
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />
        </FieldGroup>
        <Button
          type="submit"
          className=""
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting && <Loader className="animate-spin" />}
          {form.formState.isSubmitting ? "Loading..." : "Search"}
        </Button>
      </form>
    </div>
  );
}
```

Note: `useAuth` is no longer called in `SearchAccount` (the `token` it fetched is no longer needed — Apollo's `authLink` attaches it automatically). Remove the now-unused `const { token } = useAuth();` line and the `useAuth` import usage here specifically — but `useAuth` is still imported and used elsewhere in this file (`Confirm`), so do **not** remove the import statement itself in this step.

- [ ] **Step 3: Update `Confirm` to use `useMutation`**

Replace the `Confirm` function body:

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
  const { refreshUser } = useAuth();
  const [createTransactionMutation] = useMutation(CREATE_TRANSACTION_MUTATION);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleConfirm() {
    setIsSubmitting(true);
    try {
      const amountInCents = Math.round(Number(amount) * 100);
      await createTransactionMutation({
        variables: { amount: amountInCents, userId: recipient.id },
      });
      // Transaction settlement happens async on the backend (Oban worker), so
      // this may briefly show the pre-transfer balance under load.
      await refreshUser();
      onTransferComplete?.();
      goNext();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Transfer failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-y-2">
      <div className="flex flex-col gap-y-2">
        <p className="text-base leading-none font-medium">
          Confirm transfer details
        </p>
        <p className="text-muted-foreground">
          Verify transfer details, receiver account and value.
        </p>
      </div>

      <div className="flex flex-col gap-y-2">
        <div>
          <p className="font-medium text-xs mb-2">Receiver account:</p>
          <div className="bg-card ring-1 ring-foreground/10 p-2 rounded-sm">
            <p>
              {recipient.firstName} {recipient.lastName}
            </p>
            <p className="text-muted-foreground">{recipient.email}</p>
          </div>
        </div>

        <div>
          <p className="font-medium text-xs mb-2">Transfer value:</p>
          <p className="font-medium">
            {formatMoney(Math.round(Number(amount) * 100))}
          </p>
        </div>
      </div>

      <Button onClick={handleConfirm} disabled={isSubmitting}>
        Confirm
      </Button>
      <Button variant="secondary" onClick={goPrevious} disabled={isSubmitting}>
        Edit value
      </Button>
    </div>
  );
}
```

Note: `token` is no longer destructured from `useAuth()` here either — only `refreshUser` is needed now.

- [ ] **Step 4: Delete the old service file**

```bash
rm src/services/transaction.ts
```

- [ ] **Step 5: Type-check**

Run: `bun run build`
Expected: succeeds with zero remaining references to `@/services/user` or `@/services/transaction` anywhere in `src/`. Verify with:

```bash
grep -rn "@/services/" src/
```

Expected: no output.

- [ ] **Step 6: Manual verification**

Run: `bun run dev`, log in, then exercise the full transfer flow:
- Click "New Transfer" → search for a known recipient's email → recipient found, advances to "Set Value".
- Search for a nonexistent email → inline form error "No account found with that email" appears, same as before.
- Enter an amount → "Confirm" step shows recipient + amount correctly.
- Click "Confirm" → transaction succeeds, balance updates (`refreshUser` ran), dialog advances to "Done", and (per Task 4) the transactions table on the dashboard resets to page 1 and shows the new transaction after closing the dialog.

- [ ] **Step 7: Commit**

```bash
git add src/components/new-transfer-modal.tsx
git rm src/services/transaction.ts
git commit -m "feat: migrate new-transfer-modal to Apollo hooks"
```

---

### Task 6: Verify the 401 auto-logout path end-to-end

**Files:**
- None (verification only — no code changes expected unless a bug is found).

**Interfaces:**
- Consumes: the `errorLink` behavior from `src/lib/apollo-client.ts` (Task 1), exercised through any authenticated hook from Tasks 3–5.

- [ ] **Step 1: Manual verification of the 401 path**

Run: `bun run dev`, log in normally, then in the browser devtools console corrupt the stored token:

```js
sessionStorage.setItem("auth_token", "invalid-token-value");
```

Trigger any authenticated GraphQL request — e.g. reload the dashboard, or click "Next"/"Previous" on the transactions table, or open "New Transfer" and search an email.

Expected:
- The request resolves with a GraphQL error whose message is `"unauthenticated"` (per `monex_api`'s `Authentication` middleware).
- `errorLink` fires: `sessionStorage` keys `auth_token` and `auth_user` are removed (verify via devtools Application tab).
- Browser hard-navigates to `/login` (full page reload, URL bar changes).

- [ ] **Step 2: Confirm no regression on the happy path**

Log in again with valid credentials immediately after the redirect, to confirm the corrupted-token cleanup didn't leave the app in a broken state.

Expected: login succeeds, dashboard loads normally.

- [ ] **Step 3: No commit**

This task is verification-only. If Step 1 or 2 reveals a bug, fix it in `src/lib/apollo-client.ts`, re-run both steps, then commit the fix:

```bash
git add src/lib/apollo-client.ts
git commit -m "fix: correct 401 detection in errorLink"
```

(Skip the commit entirely if no fix was needed.)

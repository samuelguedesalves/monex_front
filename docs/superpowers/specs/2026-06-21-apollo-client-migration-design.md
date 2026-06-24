# Apollo Client Migration — Design

## Goal

Replace the per-file raw-`fetch` GraphQL boilerplate in [src/services/user.ts](../../../src/services/user.ts) and [src/services/transaction.ts](../../../src/services/transaction.ts) with a single Apollo Client instance, used via Apollo's React hooks everywhere a GraphQL call is made. Add middleware that auto-logs-out the user (clears session storage, redirects to `/login`) when any request comes back unauthenticated.

## Backend behavior (from monex_api)

`monex_api` never returns an HTTP 401 for an authentication failure. [lib/monex_web/plugs/set_current_user.ex](../../../../monex_api/lib/monex_web/plugs/set_current_user.ex) silently proceeds with no `current_user` in the Absinthe context when the `Authorization` header is missing, malformed, or the token fails verification. [lib/monex_web/middlewares/authentication.ex](../../../../monex_api/lib/monex_web/middlewares/authentication.ex) then resolves the field with `{:error, :unauthenticated}` — a normal GraphQL-level error, returned with **HTTP 200**. This serializes to `json.errors[0].message === "unauthenticated"`.

Consequence: 401-style detection must inspect `graphQLErrors` for that message, not `networkError.statusCode`. The message string is matched as-is rather than via a backend-added stable error code — this is a private app with both repos co-developed, so the coupling risk is low and is scoped out of this change.

## 1. Dependencies

Add `@apollo/client` and `graphql` (peer dependency) via `bun add`.

## 2. `src/lib/apollo-client.ts` (new)

A singleton `ApolloClient`, composed as a link chain:

```ts
const httpLink = new HttpLink({
  uri: import.meta.env.VITE_API_URL ?? "http://localhost:4000/api",
});

const authLink = setContext((_, { headers }) => {
  const token = sessionStorage.getItem("auth_token");
  return {
    headers: {
      ...headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };
});

const errorLink = onError(({ graphQLErrors }) => {
  const isUnauthenticated = graphQLErrors?.some(
    (e) => e.message === "unauthenticated"
  );
  if (isUnauthenticated) {
    sessionStorage.removeItem("auth_token");
    sessionStorage.removeItem("auth_user");
    window.location.href = "/login";
  }
});

export const apolloClient = new ApolloClient({
  link: errorLink.concat(authLink).concat(httpLink),
  cache: new InMemoryCache(),
});
```

- `sessionStorage` keys (`auth_token`, `auth_user`) match the constants already defined in `auth-context.tsx` — duplicated as literals here rather than importing from the context module, to keep this module fully standalone (no React/context dependency, since it must be constructible outside the component tree).
- The hard redirect (`window.location.href`) causes a full page reload, which is sufficient to land on `/login` with cleared storage — no event/listener wiring back into `AuthProvider` needed. This was an explicit choice over a custom-event approach, accepting the full-reload cost for simplicity.
- No cache type policies, optimistic updates, or subscriptions — out of scope; this is a transport swap, not a cache-strategy redesign.

## 3. `src/main.tsx`

Wrap `RouterProvider` in `ApolloProvider`:

```tsx
import { ApolloProvider } from "@apollo/client";
import { apolloClient } from "@/lib/apollo-client";

createRoot(document.getElementById("root")!).render(
  <div className="font-display">
    <ApolloProvider client={apolloClient}>
      <RouterProvider router={router} />
    </ApolloProvider>
    <Toaster />
  </div>,
);
```

## 4. `src/graphql/` (new directory)

Replaces `src/services/user.ts` and `src/services/transaction.ts`, which are **deleted**. Each file exports `gql` documents and the existing TS types — no fetch logic, no functions.

### `src/graphql/user.ts`

```ts
export const AUTH_USER_MUTATION = gql`
  mutation authUser($email: String!, $password: String!) {
    authUser(input: { email: $email, password: $password }) {
      user { id firstName lastName email balance }
      token
    }
  }
`;

export const CURRENT_USER_QUERY = gql`
  query currentUser {
    user { id firstName lastName email balance }
  }
`;

export type AuthUser = { id: string; firstName: string; lastName: string; email: string; balance: number };
export type AuthResult = { user: AuthUser; token: string };
```

### `src/graphql/transaction.ts`

```ts
export const USER_BY_EMAIL_QUERY = gql`...`; // unchanged shape
export const CREATE_TRANSACTION_MUTATION = gql`...`; // unchanged shape
export const TRANSACTIONS_FROM_USER_QUERY = gql`...`; // unchanged shape

export type TransferRecipient = { id: number; firstName: string; lastName: string; email: string };
export type Transaction = { id: number; amount: number; fromUser: number; toUser: number; processedAt: string; status: string };
export type TransactionsPage = { transactions: Transaction[]; page: number; previousPage: number; nextPage: number; quantity: number };
```

Query/mutation bodies are carried over verbatim from the current service files — only the wrapping (`gql` template instead of a plain string passed to `fetch`) changes.

## 5. Call-site migration

### `src/contexts/auth-context.tsx`

`login`, `logout`, `refreshUser` are called imperatively from event handlers and other imperative code (`LoginForm`'s `onSubmit`, `Confirm`'s `handleConfirm`) — not from render. Apollo's hooks must be called at a component's top level, so `AuthProvider` (which *is* a component) calls them there and keeps its existing exposed function signatures unchanged, so no consumer changes:

```ts
export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [state, setState] = useState<AuthState>(/* unchanged init */);
  const [authUserMutation] = useMutation(AUTH_USER_MUTATION);
  const [fetchCurrentUser] = useLazyQuery(CURRENT_USER_QUERY, { fetchPolicy: "network-only" });

  async function login(email: string, password: string) {
    const { data } = await authUserMutation({ variables: { email, password } });
    const { user, token } = data.authUser;
    // unchanged: sessionStorage.setItem(...), setState(...), navigate("/")
  }

  function logout() {
    // unchanged: sessionStorage.removeItem(...), setState(...), navigate("/login")
  }

  async function refreshUser() {
    if (!state.token) return;
    const { data } = await fetchCurrentUser();
    const user = data.user;
    // unchanged: sessionStorage.setItem(...), setState(...)
  }

  // unchanged provider/return
}
```

`fetchPolicy: "network-only"` on the lazy query preserves today's behavior (`refreshUser` always hits the network — needed because balance changes server-side after a transfer settles asynchronously).

### `src/components/transactions-table.tsx`

```ts
const { data, loading, error, refetch } = useQuery(TRANSACTIONS_FROM_USER_QUERY, {
  variables: { page },
  skip: !token,
});
```

- Apollo's own request lifecycle (each `variables` change triggers a new request, with in-flight previous requests' results ignored on resolution order) replaces the manual `requestedPage` ref-guard — that workaround is deleted.
- The `refreshKey`-changed `useEffect` (compare `refreshKey` to a ref of its previous value, reset `page` to `1` if changed) is unchanged in spirit, but when `refreshKey` changes while `page` is already `1` (no page-change to trigger a new `useQuery` variables change), it must call `refetch()` explicitly to force the reload.
- `transactions` / `quantity` are read from `data?.transactionsFromUser` instead of local state; the "Retry" button's `onClick` calls `refetch()` instead of a hand-rolled `fetchTransactions`.
- `error` is Apollo's `ApolloError`; render `error.message` (same fallback text if absent).

### `src/components/new-transfer-modal.tsx`

**`SearchAccount`:**

```ts
const [searchUser] = useLazyQuery(USER_BY_EMAIL_QUERY);

const onSubmit: SubmitHandler<findUserFormData> = async (data) => {
  try {
    const { data: result } = await searchUser({ variables: { email: data.accountEmail } });
    const user = result?.userByEmail;
    if (!user) throw new Error("not found");
    goNext(user);
  } catch (err) {
    form.setError("accountEmail", { message: "No account found with that email" });
  }
};
```

**`Confirm`:**

```ts
const [createTransactionMutation] = useMutation(CREATE_TRANSACTION_MUTATION);

async function handleConfirm() {
  setIsSubmitting(true);
  try {
    const amountInCents = Math.round(Number(amount) * 100);
    await createTransactionMutation({ variables: { amount: amountInCents, userId: recipient.id } });
    await refreshUser();
    onTransferComplete?.();
    goNext();
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Transfer failed");
  } finally {
    setIsSubmitting(false);
  }
}
```

Both hooks are called at each component's top level (`SearchAccount`/`Confirm` are components, same legality as `AuthProvider`). Success/error branching and user-facing messages are unchanged from today.

## 6. Files touched summary

| File | Change |
|---|---|
| `src/lib/apollo-client.ts` | new — singleton client + auth/error links |
| `src/graphql/user.ts` | new — replaces `services/user.ts` |
| `src/graphql/transaction.ts` | new — replaces `services/transaction.ts` |
| `src/services/user.ts` | deleted |
| `src/services/transaction.ts` | deleted |
| `src/main.tsx` | wrap with `ApolloProvider` |
| `src/contexts/auth-context.tsx` | `login`/`logout`/`refreshUser` bodies use `useMutation`/`useLazyQuery` results instead of the old service functions |
| `src/components/transactions-table.tsx` | replace manual fetch/state with `useQuery` |
| `src/components/new-transfer-modal.tsx` | `SearchAccount` uses `useLazyQuery`, `Confirm` uses `useMutation` |
| `package.json` | add `@apollo/client`, `graphql` |

## Testing

Manual verification (no test framework in this repo), per repo convention:

- Login with valid credentials → succeeds, dashboard loads (exercises `useMutation` in `AuthProvider`).
- Login with invalid credentials → error toast shown, no crash.
- Dashboard with existing transactions → table populates via `useQuery`; Previous/Next pagination still works.
- Complete a transfer (`SearchAccount` → `Confirm`) → recipient lookup and transaction creation both succeed via the new hooks; table refreshes to page 1 with the new transaction; balance updates.
- Search for a nonexistent recipient email → inline form error, same message as before.
- **401 path**: manually expire/corrupt the stored token (e.g. edit `sessionStorage.auth_token` in devtools to a bad value), then trigger any authenticated request (reload dashboard, or click "Next" on the table) → `errorLink` detects `"unauthenticated"`, clears `sessionStorage`, hard-redirects to `/login`.
- Stop the backend entirely → `TransactionsTable`'s inline error + Retry row still appears (now via Apollo's `error`/`refetch` instead of manual state) and recovers when the backend comes back.

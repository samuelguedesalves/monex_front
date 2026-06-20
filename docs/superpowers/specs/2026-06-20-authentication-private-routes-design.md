# Authentication & Private Routes Design

**Date:** 2026-06-20  
**Branch:** feat/authentication-and-private-routes

---

## Overview

Add JWT-based authentication to the Monex frontend using a React Context + custom hook pattern. Protect the `/` (dashboard) route so unauthenticated users are redirected to `/login`. Token and user data are persisted in `sessionStorage` so the session survives page refreshes but is cleared when the tab is closed.

---

## Architecture

### New files

- **`src/contexts/auth-context.tsx`** — `AuthContext` + `AuthProvider` + `useAuth()` hook
- **`src/components/private-route.tsx`** — Layout route that guards authenticated routes

### Modified files

- **`src/services/user.ts`** — Implement the `authUser` GraphQL mutation call
- **`src/components/login-form.tsx`** — Wire `onSubmit` to `useAuth().login()`, show toast on error
- **`src/main.tsx`** — Wrap router in `AuthProvider`, restructure routes with `PrivateRoute`

---

## Data Flow

1. User submits the login form
2. `LoginForm.onSubmit` calls `useAuth().login(email, password)`
3. `AuthContext.login()` calls `authUser(email, password)` from `services/user.ts`
4. `services/user.ts` sends a `POST` to `http://localhost:4000/api` with the `authUser` GraphQL mutation
5. On success: `{ user, token }` stored in context state and `sessionStorage`; router navigates to `/`
6. On failure: error thrown, `LoginForm` catches it and shows a sonner toast with the error message
7. On any navigation to `/`: `PrivateRoute` reads `token` from context — if absent, redirects to `/login`
8. On page refresh: `AuthContext` reads `sessionStorage` on mount and rehydrates `user` + `token` state

---

## GraphQL Mutation

**Endpoint:** `POST http://localhost:4000/api`  
**Headers:** `Content-Type: application/json`

```graphql
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
```

**Success response shape:**
```json
{
  "data": {
    "authUser": {
      "user": { "id": "...", "firstName": "...", "lastName": "...", "email": "...", "balance": 0 },
      "token": "<jwt>"
    }
  }
}
```

**Error handling:** If `response.data.errors` is present or `authUser` is null, throw an error with the first GraphQL error message.

---

## Component Responsibilities

### `AuthContext` (`src/contexts/auth-context.tsx`)

**State:**
- `user: { id, firstName, lastName, email, balance } | null`
- `token: string | null`

**Methods:**
- `login(email, password)`: calls `authUser()`, sets state, writes both to `sessionStorage`, navigates to `/`
- `logout()`: clears state and removes both keys from `sessionStorage`

**Initialization:** On mount, reads `sessionStorage` keys `auth_token` and `auth_user` and rehydrates state if present.

**Exports:** `AuthProvider` (component), `useAuth` (hook)

---

### `PrivateRoute` (`src/components/private-route.tsx`)

- Reads `token` from `useAuth()`
- If `token` is null: returns `<Navigate to="/login" replace />`
- If `token` is present: returns `<Outlet />`

---

### `services/user.ts`

- `authUser(email: string, password: string)`: sends the GraphQL mutation via native `fetch`, returns `{ user, token }`, throws a descriptive error on GraphQL errors or network failure

---

### `LoginForm` changes (`src/components/login-form.tsx`)

- `onSubmit` calls `await login(email, password)` from `useAuth()`
- On error: shows a sonner `toast.error` with the error message
- No other changes to the form UI

---

### `main.tsx` changes

**Before:**
```tsx
createBrowserRouter([
  { path: "/login", element: <Login /> },
  { path: "/", element: <Dashboard /> },
])
```

**After:**
```tsx
const router = createBrowserRouter([
  { path: "/login", element: <Login /> },
  {
    element: <PrivateRoute />,
    children: [
      { path: "/", element: <Dashboard /> },
    ],
  },
]);

// render:
<AuthProvider>
  <RouterProvider router={router} />
</AuthProvider>
```

---

## sessionStorage Keys

| Key | Value |
|---|---|
| `auth_token` | JWT string |
| `auth_user` | JSON-stringified user object |

---

## Error Handling

| Scenario | Behavior |
|---|---|
| Wrong credentials | GraphQL error message shown as sonner toast |
| Network failure | Generic "Network error" toast |
| Token missing on navigation | Redirect to `/login` |
| sessionStorage unavailable | App falls back to in-memory only (no crash) |

---

## Out of Scope

- Refresh tokens
- Token expiry handling / auto-logout
- Sign Up flow
- Forgot password flow

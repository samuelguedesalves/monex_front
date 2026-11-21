![Monex - Web Client](./readme_cover.png)

# Monex — Web Client

Monex is a toy banking app: users sign in, check their balance, send money to other users by email, and follow the status of each transfer. This repository is the **web frontend**. The backend is a separate Elixir/Phoenix GraphQL API ([monex_api](https://github.com/samuelguedesalves/monex_api)).

## Features

- **Sign in** with email and password. The session is stored in `sessionStorage`, so it ends when the tab is closed.
- **Dashboard** showing the current balance and a paginated list of transactions, sent and received.
- **New transfer** flow in four steps: find the recipient by email, enter the amount, confirm, then wait for the result. The result step polls the API until the transaction is `done` or `refuse`d. If it is still pending after 15 seconds, the dialog tells the user to check the transaction list.
- **Automatic logout** when the API answers `unauthenticated`, for example when the token has expired.

## Tech stack

| Concern         | Choice                                                        |
| --------------- | ------------------------------------------------------------- |
| Runtime / PM    | [Bun](https://bun.sh) (version pinned in `.tool-versions`)    |
| Build tool      | [Vite](https://vite.dev) 6 with SWC                           |
| UI              | React 19 + TypeScript                                         |
| Styling         | Tailwind CSS v4 + [shadcn/ui](https://ui.shadcn.com) (Radix)  |
| Routing         | `react-router` v7 (`createBrowserRouter`)                     |
| Data fetching   | Apollo Client 4 (GraphQL)                                     |
| Forms           | `react-hook-form` + `zod`                                     |
| Notifications   | `sonner`                                                      |
| Icons           | `lucide-react`                                                |

## Getting started

### Prerequisites

- [Bun](https://bun.sh) (see `.tool-versions`; with [asdf](https://asdf-vm.com) or mise, run `asdf install`)
- A running instance of [monex_api](https://github.com/samuelguedesalves/monex_api). By default the frontend expects it at `http://localhost:4000/api`.

### Install and run

```bash
bun install
bun run dev
```

The app runs at <http://localhost:5173>.

### Configuration

| Variable       | Default                     | Description                   |
| -------------- | --------------------------- | ----------------------------- |
| `VITE_API_URL` | `http://localhost:4000/api` | GraphQL endpoint of the API.  |

To change it, create a `.env.local` file at the project root:

```bash
VITE_API_URL=http://localhost:4000/api
```

## Scripts

| Command           | What it does                                                  |
| ----------------- | ------------------------------------------------------------- |
| `bun run dev`     | Starts the Vite dev server with hot reload.                   |
| `bun run build`   | Type-checks (`tsc -b`) and builds for production into `dist/`. |
| `bun run preview` | Serves the production build locally.                          |
| `bun run lint`    | Runs ESLint over the project.                                 |

## Routes

All routes live in `src/main.tsx` and are nested under a `RootLayout` that provides the auth context.

| Path     | Access  | Layout                              | Page        | Description                                                           |
| -------- | ------- | ----------------------------------- | ----------- | --------------------------------------------------------------------- |
| `/login` | Public  | `PublicLayout` (simple header)      | `Login`     | Email and password sign-in form.                                      |
| `/`      | Private | `PrivateLayout` (header with user)  | `Dashboard` | Balance, "New Transfer" button and the transactions table.            |

Private routes are wrapped by `PrivateRoute`, which redirects to `/login` when there is no token in the session. It only checks that a token exists. An invalid or expired token is caught later, when the API rejects a request, and the Apollo error link then clears the session and redirects to `/login`.

## Project structure

```
src/
├── main.tsx                 # Entry point: router, layouts, Apollo provider, toaster
├── index.css                # Tailwind + theme tokens
├── pages/
│   ├── login.tsx            # /login
│   └── dashboard.tsx        # / (balance summary + transactions)
├── components/
│   ├── container.tsx
│   ├── header.tsx
│   ├── login-form.tsx
│   ├── new-transfer-modal.tsx
│   ├── private-route.tsx
│   ├── quit-confirm-dialog.tsx
│   ├── transactions-table.tsx
│   └── ui/                  # shadcn/ui primitives (generated)
├── contexts/
│   └── auth-context.tsx     # AuthProvider + useAuth()
├── graphql/
│   ├── user.ts              # authUser mutation, currentUser query
│   └── transaction.ts       # userByEmail, createTransaction, transaction status, transactionsFromUser
└── lib/
    ├── apollo-client.ts     # Apollo client, auth header and unauthenticated handling
    ├── numberFormatter.ts   # formatMoney()
    └── utils.ts             # cn() class-name helper
```

## Components

### App components (`src/components`)

| Component           | Description                                                                                                                                                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Container`         | Centered, max-width wrapper used for page layout.                                                                                                                                                                                                            |
| `Header`            | Top bar with two variants: `simple` (logo only, for public pages) and `logged` (logo, user name and the quit button).                                                                                                                                       |
| `LoginForm`         | Email and password form validated with `zod`. Calls `login()` from the auth context and shows an error toast if it fails.                                                                                                                                     |
| `PrivateRoute`      | Route guard that renders the nested routes when a token exists, or redirects to `/login`.                                                                                                                                                                     |
| `QuitConfirmDialog` | Confirmation dialog shown before logging out.                                                                                                                                                                                                                |
| `NewTransferDialog` | Multi-step transfer dialog (`new-transfer-modal.tsx`). Steps: **Set Account** (recipient lookup by email), **Set Value** (amount such as `10.00`), **Confirm** (creates the transaction), **Result** (polls the status every second for up to 15 s). |
| `TransactionsTable` | Paginated table (10 per page) of the user's transactions, showing direction, details, amount, status and date. Refetches when a transfer finishes.                                                                                                           |

### UI primitives (`src/components/ui`)

Generated by [shadcn/ui](https://ui.shadcn.com) (style `radix-nova`, base color `neutral`; see `components.json`): `button`, `dialog`, `field`, `form`, `input`, `label`, `pagination`, `separator`, `sonner`, `table`. Treat them as vendored code and build app components on top of them rather than editing them directly. To add a new one:

```bash
bunx shadcn@latest add <component>
```

### Auth context (`src/contexts/auth-context.tsx`)

`AuthProvider` holds `{ user, token }`, saves them to `sessionStorage` (`auth_token` / `auth_user`), and exposes them through `useAuth()`:

- `login(email, password)`: calls the `authUser` mutation, stores the session and navigates to `/`.
- `logout()`: clears the session and navigates to `/login`.
- `refreshUser()`: fetches the current user again, for example to update the balance after a transfer.

### Money values

Amounts are **integers in cents** everywhere: in the API and in frontend state. `formatMoney()` (`src/lib/numberFormatter.ts`) divides by 100 for display (`$ 1,234.56`). User input such as `12.50` is converted with `Math.round(Number(value) * 100)` before it is sent.

## Testing

No automated test framework is configured yet. To check a change:

1. **Static checks**: run the linter and the type check.

   ```bash
   bun run lint
   bunx tsc -b
   ```

2. **Manual end-to-end test** against a local API:

   1. Start the API ([monex_api](https://github.com/samuelguedesalves/monex_api)) on port `4000`.
   2. Create some test users. The API's load-test seed is a quick way to do it. From the `monex_api` folder, run:

      ```bash
      USERS=5 mix run loadtest/seed.exs
      ```

      This creates `user1@loadtest.monex` … `user5@loadtest.monex`, all with the password `loadtest123` and a balance of `$ 100.00`.
   3. Run `bun run dev` and open <http://localhost:5173>.
   4. Sign in as `user1@loadtest.monex` and check that the balance and the transactions table load.
   5. Click **New Transfer**, search for `user2@loadtest.monex`, send `10.00` and confirm. The result step should show **Transfer complete**, the balance should drop and the table should show the new transaction.
   6. Try to send more than the balance. The result should be **Transfer refused**.
   7. Sign in as `user2@loadtest.monex` and check that the transfer appears as received.
   8. Click **Quit** and confirm. You should be redirected to `/login`, and opening `/` should redirect you back to `/login`.

## Build

```bash
bun run build     # type-check + production build into dist/
bun run preview   # serve dist/ locally to check it
```

`VITE_API_URL` is read **at build time**, so set it to the production API before building:

```bash
VITE_API_URL=https://api.example.com/api bun run build
```

The output in `dist/` is a static single-page app. When you deploy it, configure the server to fall back to `index.html` for unknown paths, so that client-side routes such as `/login` work when the page is reloaded.

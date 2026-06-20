# Authentication & Private Routes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add JWT-based authentication with a React Context + private route guard so the `/` dashboard is only accessible to authenticated users.

**Architecture:** An `AuthContext` manages `user` and `token` state, reads/writes from `sessionStorage` for persistence across refreshes, and exposes a `useAuth()` hook. A `PrivateRoute` component checks the token and redirects unauthenticated users to `/login`. The GraphQL `authUser` mutation is called via native `fetch` in `services/user.ts`.

**Tech Stack:** React 19, React Router v7, TypeScript, Zod, react-hook-form, sonner (toasts), native fetch

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/services/user.ts` | Modify | `authUser` GraphQL mutation via fetch |
| `src/contexts/auth-context.tsx` | Create | `AuthContext`, `AuthProvider`, `useAuth` hook |
| `src/components/private-route.tsx` | Create | Route guard — redirects to `/login` if no token |
| `src/components/login-form.tsx` | Modify | Wire `onSubmit` to `useAuth().login()`, toast on error |
| `src/main.tsx` | Modify | Wrap with `AuthProvider`, nest dashboard under `PrivateRoute` |

---

### Task 1: Implement `authUser` in `services/user.ts`

**Files:**
- Modify: `src/services/user.ts`

This task has no testable unit in isolation (it hits a real network), so we implement and manually verify.

- [ ] **Step 1: Replace the stub with the real implementation**

Open `src/services/user.ts` and replace its entire content with:

```ts
const GQL_ENDPOINT = "http://localhost:4000/api";

const AUTH_USER_MUTATION = `
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

export async function authUser(
  email: string,
  password: string
): Promise<AuthResult> {
  const response = await fetch(GQL_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: AUTH_USER_MUTATION,
      operationName: "authUser",
      variables: { email, password },
    }),
  });

  if (!response.ok) {
    throw new Error(`Network error: ${response.status}`);
  }

  const json = await response.json();

  if (json.errors?.length) {
    throw new Error(json.errors[0].message);
  }

  const result = json.data?.authUser;
  if (!result) {
    throw new Error("Authentication failed");
  }

  return result;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/smk/projects/monex_front && npx tsc --noEmit
```

Expected: no errors related to `services/user.ts`

- [ ] **Step 3: Commit**

```bash
git add src/services/user.ts
git commit -m "feat: implement authUser GraphQL mutation in user service"
```

---

### Task 2: Create `AuthContext`

**Files:**
- Create: `src/contexts/auth-context.tsx`

- [ ] **Step 1: Create the contexts directory and the file**

```bash
mkdir -p src/contexts
```

Then create `src/contexts/auth-context.tsx` with:

```tsx
import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router";
import { authUser as authUserService, type AuthUser } from "@/services/user";

const TOKEN_KEY = "auth_token";
const USER_KEY = "auth_user";

type AuthState = {
  user: AuthUser | null;
  token: string | null;
};

type AuthContextValue = AuthState & {
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
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

  async function login(email: string, password: string) {
    const { user, token } = await authUserService(email, password);
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
  }

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
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

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/smk/projects/monex_front && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/contexts/auth-context.tsx
git commit -m "feat: add AuthContext with login, logout, and sessionStorage persistence"
```

---

### Task 3: Create `PrivateRoute`

**Files:**
- Create: `src/components/private-route.tsx`

- [ ] **Step 1: Create the file**

Create `src/components/private-route.tsx` with:

```tsx
import { Navigate, Outlet } from "react-router";
import { useAuth } from "@/contexts/auth-context";

export function PrivateRoute() {
  const { token } = useAuth();

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/smk/projects/monex_front && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/private-route.tsx
git commit -m "feat: add PrivateRoute component to guard authenticated routes"
```

---

### Task 4: Wire `AuthProvider` and `PrivateRoute` into the router

**Files:**
- Modify: `src/main.tsx`

- [ ] **Step 1: Update `main.tsx`**

Replace the entire content of `src/main.tsx` with:

```tsx
import { createRoot } from "react-dom/client";
import "./index.css";
import { createBrowserRouter, RouterProvider } from "react-router";
import { Login } from "@/pages/login";
import { Header } from "@/components/header";
import { Dashboard } from "@/pages/dashboard";
import { AuthProvider } from "@/contexts/auth-context";
import { PrivateRoute } from "@/components/private-route";

const router = createBrowserRouter([
  {
    path: "/login",
    element: <Login />,
  },
  {
    element: <PrivateRoute />,
    children: [
      {
        path: "/",
        element: <Dashboard />,
      },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <div className="font-display">
    <Header variant="simple" />
    <RouterProvider router={router} />
  </div>,
);
```

> **Note:** `AuthProvider` uses `useNavigate` internally, which requires it to be rendered inside the router tree. We wrap `RouterProvider` with `AuthProvider` by making `AuthProvider` a layout element. Update the router to wrap all routes in an `AuthProvider` layout route:

```tsx
import { createRoot } from "react-dom/client";
import "./index.css";
import { createBrowserRouter, Outlet, RouterProvider } from "react-router";
import { Login } from "@/pages/login";
import { Header } from "@/components/header";
import { Dashboard } from "@/pages/dashboard";
import { AuthProvider } from "@/contexts/auth-context";
import { PrivateRoute } from "@/components/private-route";

function RootLayout() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}

const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      {
        path: "/login",
        element: <Login />,
      },
      {
        element: <PrivateRoute />,
        children: [
          {
            path: "/",
            element: <Dashboard />,
          },
        ],
      },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <div className="font-display">
    <Header variant="simple" />
    <RouterProvider router={router} />
  </div>,
);
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/smk/projects/monex_front && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/main.tsx
git commit -m "feat: wrap router with AuthProvider and protect dashboard with PrivateRoute"
```

---

### Task 5: Wire login form to `useAuth().login()`

**Files:**
- Modify: `src/components/login-form.tsx`

- [ ] **Step 1: Update `onSubmit` in `LoginForm`**

In `src/components/login-form.tsx`, make the following changes:

1. Add import for `useAuth` at the top:

```tsx
import { useAuth } from "@/contexts/auth-context";
```

2. Inside `LoginForm`, add:

```tsx
const { login } = useAuth();
```

3. Replace the `onSubmit` function with:

```tsx
async function onSubmit(data: FormData) {
  try {
    await login(data.email, data.password);
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Authentication failed");
  }
}
```

The final `login-form.tsx` should look like:

```tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/auth-context";

const FormSchema = z.object({
  email: z.email("Invalid email"),
  password: z.string().min(6, {
    message: "Password must be at least 6 characters.",
  }),
});

type FormData = z.infer<typeof FormSchema>;

export function LoginForm() {
  const { login } = useAuth();
  const form = useForm<FormData>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  async function onSubmit(data: FormData) {
    try {
      await login(data.email, data.password);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="w-2/3 space-y-6">
        <h1 className="text-2xl font-bold my-4">Login</h1>
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input placeholder="Enter your email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input type="password" placeholder="Enter your password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 gap-y-2">
          <Button variant="link" className="block p-0 justify-self-start">
            Forgot password?
          </Button>
          <Button type="submit" className="w-full">
            Sign In
          </Button>
          <Button type="button" variant="secondary" className="w-full">
            Sign Up
          </Button>
        </div>
      </form>
    </Form>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/smk/projects/monex_front && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/login-form.tsx
git commit -m "feat: wire login form to AuthContext and show toast on error"
```

---

### Task 6: Manual end-to-end verification

- [ ] **Step 1: Start the dev server**

```bash
cd /home/smk/projects/monex_front && npm run dev
```

- [ ] **Step 2: Test unauthenticated redirect**

Navigate to `http://localhost:5173/` — you should be immediately redirected to `/login`.

- [ ] **Step 3: Test failed login**

On the login page, enter wrong credentials (e.g. `wrong@email.com` / `wrongpass`) and submit. Expected: sonner toast with the API's error message (e.g. "Invalid credentials").

- [ ] **Step 4: Test successful login**

Enter correct credentials (`slink777@live.com` / `123456`) and submit. Expected: redirected to `/` (dashboard).

- [ ] **Step 5: Test session persistence**

While logged in, refresh the page. Expected: dashboard still shows (not redirected to login).

- [ ] **Step 6: Test session cleared on tab close**

Close the tab, open a new one, navigate to `http://localhost:5173/`. Expected: redirected to `/login`.

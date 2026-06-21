# Transfer Modal API Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire `NewTransferDialog` to the real GraphQL API (authenticated via JWT) instead of hardcoded data: search a recipient by email, create a transaction, refresh the current user's balance, and show a new success step.

**Architecture:** A new `src/services/transaction.ts` service (mirroring the existing `src/services/user.ts` pattern) makes authenticated GraphQL calls for `userByEmail` and `createTransaction`. `src/services/user.ts` gains `getCurrentUser` for balance refresh. `src/contexts/auth-context.tsx` gains `refreshUser()`. `new-transfer-modal.tsx` is reworked to lift wizard state (recipient, amount) into the parent, call the new services, show `sonner` toasts on error, and add a 4th "Done" step.

**Tech Stack:** React 19, TypeScript, react-hook-form + zod, fetch (no axios), sonner (toast), no test framework configured (verification is `tsc -b`, `eslint`, and manual browser checks).

## Global Constraints

- `amount` and `balance` are integers in cents (e.g. `$50.00` → `5000`). Source: [src/lib/numberFormatter.ts](../../../src/lib/numberFormatter.ts) divides by 100.
- All authenticated GraphQL calls require header `Authorization: Bearer <token>`.
- GraphQL endpoint: `import.meta.env.VITE_API_URL ?? "http://localhost:4000/api"` (existing convention in `user.ts`).
- Errors surface via `toast.error(err instanceof Error ? err.message : "<fallback>")`, matching [src/components/login-form.tsx:43](../../../src/components/login-form.tsx#L43). No inline banners.
- No automated test framework exists in this repo (no vitest/jest, no `*.test.*` files). "Tests" in this plan mean: `npx tsc -b --noEmit` for type checking, `npm run lint`, and manual verification against the running dev server + real API.

---

### Task 1: `transaction` service — `getUserByEmail`

**Files:**
- Create: `src/services/transaction.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `export type TransferRecipient = { id: number; firstName: string; lastName: string; email: string }`. `export async function getUserByEmail(email: string, token: string): Promise<TransferRecipient | null>`. Task 4 (UI) calls this.

- [ ] **Step 1: Write `src/services/transaction.ts` with the GraphQL endpoint constant and `getUserByEmail`**

```ts
const GQL_ENDPOINT = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";

const USER_BY_EMAIL_QUERY = `
  query userByEmail($email: String!) {
    userByEmail(email: $email) {
      id
      firstName
      lastName
      email
    }
  }
`;

const CREATE_TRANSACTION_MUTATION = `
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

async function gqlRequest<T>(
  query: string,
  operationName: string,
  variables: Record<string, unknown>,
  token: string
): Promise<T> {
  const response = await fetch(GQL_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, operationName, variables }),
  });

  if (!response.ok) {
    throw new Error(`Network error: ${response.status}`);
  }

  const json = await response.json();

  if (json.errors?.length) {
    throw new Error(json.errors[0].message);
  }

  return json.data as T;
}

export async function getUserByEmail(
  email: string,
  token: string
): Promise<TransferRecipient | null> {
  const data = await gqlRequest<{ userByEmail: TransferRecipient | null }>(
    USER_BY_EMAIL_QUERY,
    "userByEmail",
    { email },
    token
  );

  return data.userByEmail ?? null;
}

export async function createTransaction(
  input: { amount: number; userId: number },
  token: string
): Promise<Transaction> {
  const data = await gqlRequest<{ createTransaction: Transaction }>(
    CREATE_TRANSACTION_MUTATION,
    "createTransaction",
    { amount: input.amount, userId: input.userId },
    token
  );

  return data.createTransaction;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc -b --noEmit`
Expected: no errors related to `src/services/transaction.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/services/transaction.ts
git commit -m "feat: add transaction service for userByEmail and createTransaction"
```

---

### Task 2: `user` service — `getCurrentUser`

**Files:**
- Modify: `src/services/user.ts`

**Interfaces:**
- Consumes: nothing from other tasks (duplicates a small fetch helper rather than importing from `transaction.ts`, to keep `user.ts` self-contained like it already is — `authUser` has no token).
- Produces: `export async function getCurrentUser(token: string): Promise<AuthUser>`. Task 3 (`auth-context.tsx`) calls this.

- [ ] **Step 1: Add the `CURRENT_USER_QUERY` and `getCurrentUser` to `src/services/user.ts`**

Add after the existing `AUTH_USER_MUTATION` constant (around line 16):

```ts
const CURRENT_USER_QUERY = `
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
```

Add after the existing `authUser` function (end of file, after line 61):

```ts
export async function getCurrentUser(token: string): Promise<AuthUser> {
  const response = await fetch(GQL_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      query: CURRENT_USER_QUERY,
      operationName: "currentUser",
      variables: {},
    }),
  });

  if (!response.ok) {
    throw new Error(`Network error: ${response.status}`);
  }

  const json = await response.json();

  if (json.errors?.length) {
    throw new Error(json.errors[0].message);
  }

  const result = json.data?.user;
  if (!result) {
    throw new Error("Failed to load current user");
  }

  return result;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc -b --noEmit`
Expected: no errors related to `src/services/user.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/services/user.ts
git commit -m "feat: add getCurrentUser to user service for balance refresh"
```

---

### Task 3: `refreshUser` in `AuthContext`

**Files:**
- Modify: `src/contexts/auth-context.tsx`

**Interfaces:**
- Consumes: `getCurrentUser(token: string): Promise<AuthUser>` from Task 2.
- Produces: `refreshUser(): Promise<void>` added to `AuthContextValue`, callable via `useAuth()`. Task 4 (UI) calls this after a successful transfer.

- [ ] **Step 1: Import `getCurrentUser` and add `refreshUser` to the context**

Modify the import on line 8:

```ts
import { authUser as authUserService, getCurrentUser, type AuthUser, type AuthResult } from "@/services/user";
```

Modify `AuthContextValue` (lines 18-21) to add `refreshUser`:

```ts
type AuthContextValue = AuthState & {
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
};
```

Add a `refreshUser` function inside `AuthProvider`, after `logout` (after line 61, before the closing `return`):

```ts
  async function refreshUser() {
    if (!state.token) {
      return;
    }
    const user = await getCurrentUser(state.token);
    try {
      sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch {
      // sessionStorage unavailable — continue with in-memory only
    }
    setState((prev) => ({ ...prev, user }));
  }
```

Update the provider value (line 64) to include it:

```tsx
    <AuthContext.Provider value={{ ...state, login, logout, refreshUser }}>
```

- [ ] **Step 2: Type-check**

Run: `npx tsc -b --noEmit`
Expected: no errors related to `src/contexts/auth-context.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/contexts/auth-context.tsx
git commit -m "feat: add refreshUser to AuthContext for balance refresh after transfer"
```

---

### Task 4: Rework `new-transfer-modal.tsx`

**Files:**
- Modify: `src/components/new-transfer-modal.tsx`

**Interfaces:**
- Consumes:
  - `getUserByEmail(email: string, token: string): Promise<TransferRecipient | null>` and `createTransaction(input: { amount: number; userId: number }, token: string): Promise<Transaction>` from Task 1 (`@/services/transaction`).
  - `refreshUser(): Promise<void>` and `token` from `useAuth()` (Task 3, `@/contexts/auth-context`).
  - `formatMoney(value: number): string` from `@/lib/numberFormatter` (existing, divides by 100).
  - `toast` from `sonner` (existing dependency, used in `login-form.tsx`).
- Produces: `NewTransferDialog` component (default export usage unchanged — named export `NewTransferDialog`, consumed by `src/pages/dashboard.tsx:2` — no signature change there).

This task rewrites the whole file. Read the current file at [src/components/new-transfer-modal.tsx](../../../src/components/new-transfer-modal.tsx) (96 lines) before starting — the diff below is a full replacement.

- [ ] **Step 1: Replace the full contents of `src/components/new-transfer-modal.tsx`**

```tsx
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Controller, useForm, SubmitHandler } from "react-hook-form";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { CircleDashed, CircleCheck, Circle, CheckCircle2 } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";
import {
  getUserByEmail,
  createTransaction,
  type TransferRecipient,
} from "@/services/transaction";
import { formatMoney } from "@/lib/numberFormatter";
import { toast } from "sonner";

const steps = [
  { id: 1, name: "Set Account" },
  { id: 2, name: "Set Value" },
  { id: 3, name: "Confirm" },
  { id: 4, name: "Done" },
] as const;

export function NewTransferDialog() {
  const [open, setOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState<number>(steps[0].id);
  const [recipient, setRecipient] = useState<TransferRecipient | null>(null);
  const [amount, setAmount] = useState<string>("");

  function reset() {
    setCurrentStep(steps[0].id);
    setRecipient(null);
    setAmount("");
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      reset();
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="default">New Transfer</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>New transfer</DialogTitle>
          <DialogDescription>
            Transfer credits to other account.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-4">
          {steps.map((step) => (
            <div className="flex flex-col items-center" key={step.id}>
              {step.id === currentStep && <Circle />}
              {step.id < currentStep && <CircleCheck />}
              {step.id > currentStep && <CircleDashed />}
              <p className={cn(step.id === currentStep && "font-bold")}>
                {step.name}
              </p>
            </div>
          ))}
        </div>
        <Separator />
        {currentStep === 1 && (
          <SearchAccount
            goNext={(user) => {
              setRecipient(user);
              setCurrentStep(2);
            }}
          />
        )}
        {currentStep === 2 && (
          <SetValue
            recipient={recipient!}
            goNext={(value) => {
              setAmount(value);
              setCurrentStep(3);
            }}
            goPrevious={() => setCurrentStep(1)}
          />
        )}
        {currentStep === 3 && (
          <Confirm
            recipient={recipient!}
            amount={amount}
            goNext={() => setCurrentStep(4)}
            goPrevious={() => setCurrentStep(2)}
          />
        )}
        {currentStep === 4 && (
          <Success
            recipient={recipient!}
            amount={amount}
            onDone={() => handleOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// Search Account

const findUserFormSchema = z.object({
  accountEmail: z.email({ error: "Invalid email" }),
});

type findUserFormData = z.infer<typeof findUserFormSchema>;

function SearchAccount({
  goNext,
}: {
  goNext: (user: TransferRecipient) => void;
}) {
  const { token } = useAuth();
  const form = useForm<findUserFormData>({
    resolver: zodResolver(findUserFormSchema),
    defaultValues: {
      accountEmail: "",
    },
  });

  const onSubmit: SubmitHandler<findUserFormData> = async (data) => {
    try {
      const user = await getUserByEmail(data.accountEmail, token!);
      if (!user) {
        toast.error("No account found with that email");
        return;
      }
      goNext(user);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Search failed");
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
        className="grid grid-cols-4 gap-4"
      >
        <FieldGroup className="col-span-3">
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
          className="col-span-1 self-end"
          disabled={form.formState.isSubmitting}
        >
          Search
        </Button>
      </form>
    </div>
  );
}

// Set Value Form

const setValueFormSchema = z.object({
  value: z
    .string()
    .regex(/^\d+\.\d{2}$/, "Must be a number with decimals. Ex: 1000.00"),
});

type setValueFormData = z.infer<typeof setValueFormSchema>;

function SetValue({
  recipient,
  goNext,
  goPrevious,
}: {
  recipient: TransferRecipient;
  goNext: (value: string) => void;
  goPrevious: VoidFunction;
}) {
  const form = useForm<setValueFormData>({
    resolver: zodResolver(setValueFormSchema),
    defaultValues: {
      value: "",
    },
  });

  const onSubmit: SubmitHandler<setValueFormData> = (data) => {
    goNext(data.value);
  };

  return (
    <div className="grid grid-cols-1 gap-y-6">
      <div className="flex flex-col gap-y-2">
        <p className="text-base leading-none font-medium">Set transfer value</p>
        <p className="text-muted-foreground">
          Set a value to transfer to receiver account
        </p>
      </div>

      <div>
        <p className="font-medium text-xs mb-2">Receiver account:</p>
        <div className="bg-card ring-1 ring-foreground/10 p-2 rounded-sm">
          <p>
            {recipient.firstName} {recipient.lastName}
          </p>
          <p className="text-muted-foreground">{recipient.email}</p>
        </div>
      </div>

      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="grid grid-cols-1 gap-y-2"
      >
        <FieldGroup>
          <Controller
            name="value"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field>
                <Label htmlFor={field.name}>Transfer value</Label>
                <Input {...field} />
                <FieldDescription>
                  Transfer value should be number with decimals
                </FieldDescription>
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />
        </FieldGroup>
        <Button type="submit">Next</Button>
        <Button type="button" variant="secondary" onClick={goPrevious}>
          Edit Account
        </Button>
      </form>
    </div>
  );
}

// Confirm

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
  const { token, refreshUser } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleConfirm() {
    setIsSubmitting(true);
    try {
      const amountInCents = Math.round(Number(amount) * 100);
      await createTransaction(
        { amount: amountInCents, userId: recipient.id },
        token!
      );
      await refreshUser();
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
      <Button
        variant="secondary"
        onClick={goPrevious}
        disabled={isSubmitting}
      >
        Edit value
      </Button>
    </div>
  );
}

// Success

function Success({
  recipient,
  amount,
  onDone,
}: {
  recipient: TransferRecipient;
  amount: string;
  onDone: VoidFunction;
}) {
  return (
    <div className="grid grid-cols-1 gap-y-4">
      <div className="flex flex-col items-center gap-y-2 text-center">
        <CheckCircle2 className="size-10 text-primary" />
        <p className="text-base leading-none font-medium">Transfer complete</p>
        <p className="text-muted-foreground">
          {formatMoney(Math.round(Number(amount) * 100))} sent to{" "}
          {recipient.firstName} {recipient.lastName}.
        </p>
      </div>
      <Button onClick={onDone}>Done</Button>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc -b --noEmit`
Expected: no errors. If `useAuth()`'s `token` type is `string | null`, the `token!` non-null assertions in `SearchAccount` and `Confirm` are valid because the dialog is only reachable behind `PrivateRoute` (verify this in [src/components/private-route.tsx](../../../src/components/private-route.tsx) if the type-check flags it).

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors in `src/components/new-transfer-modal.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/components/new-transfer-modal.tsx
git commit -m "feat: integrate new-transfer-modal with transaction API"
```

---

### Task 5: Manual verification

**Files:** none (verification only).

- [ ] **Step 1: Start the API and front-end dev servers**

Run the monex_api Phoenix server (per that repo's normal start command, e.g. `mix phx.server` from `/home/smk/projects/monex_api`) and the front-end:

Run: `npm run dev` (from `/home/smk/projects/monex_front`)

- [ ] **Step 2: Log in and open the transfer dialog**

In the browser, log in with a known user, click "New Transfer" on the dashboard.

- [ ] **Step 3: Verify the happy path**

Search a real existing account's email → confirm it advances to step 2 showing the real name/email. Enter a valid amount (e.g. `10.00`) → step 3 shows the correct formatted amount and recipient. Click Confirm → step 4 "Transfer complete" shown. Click Done → dialog closes, dashboard balance reflects the deduction.

- [ ] **Step 4: Verify error paths**

Search a non-existent email → toast "No account found with that email" appears, stays on step 1. Attempt a transfer with an amount exceeding balance (if the API enforces this) → error toast appears on step 3, dialog stays open, "Edit value" still works.

- [ ] **Step 5: Verify reset-on-close**

Open the dialog, advance to step 2 or 3, close the dialog (e.g. click outside or Escape), reopen it → confirm it starts back at step 1 with no leftover recipient/amount.

- [ ] **Step 6: Final commit (if any fixups were needed)**

If verification uncovered bugs, fix them in the relevant task's file and commit:

```bash
git add -A
git commit -m "fix: address issues found during manual verification"
```

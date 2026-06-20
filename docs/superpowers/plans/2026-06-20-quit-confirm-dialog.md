# Quit Confirm Dialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `QuitConfirmDialog` component that intercepts the "Quit" button in the logged header and asks the user to confirm before logging out.

**Architecture:** A new self-contained component `QuitConfirmDialog` owns its own open/closed state, renders the existing Quit button as its trigger, and calls `logout()` from `AuthContext` on confirm. `LoggedHeader` replaces its bare `<button>` with `<QuitConfirmDialog />`.

**Tech Stack:** React 19, TypeScript, Radix UI (`radix-ui` package), Tailwind CSS, `lucide-react`

## Global Constraints

- Copy must match spec exactly: title "Are you sure you want to quit?", cancel "Cancel", confirm "Yes, quit"
- No props on `QuitConfirmDialog` — fully self-contained
- Cancel closes dialog only — no toast, no side effects
- Quit trigger must look identical to the current bare button in `LoggedHeader`

---

### Task 1: Create `QuitConfirmDialog` component

**Files:**
- Create: `src/components/quit-confirm-dialog.tsx`
- Modify: `src/components/header.tsx`

**Interfaces:**
- Consumes: `useAuth` from `@/contexts/auth-context` → `logout: () => void`
- Consumes: `Dialog`, `DialogContent`, `DialogTitle`, `DialogHeader`, `DialogFooter`, `DialogTrigger`, `DialogClose` from `@/components/ui/dialog`
- Consumes: `Button` from `@/components/ui/button`
- Produces: `QuitConfirmDialog` — default-exported named export, no props

- [ ] **Step 1: Create the component file**

Create `src/components/quit-confirm-dialog.tsx` with this content:

```tsx
import { useAuth } from "@/contexts/auth-context";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function QuitConfirmDialog() {
  const { logout } = useAuth();

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button" className="flex items-center gap-x-2">
          Quit
          <img src="./icons/exit.svg" alt="" />
        </button>
      </DialogTrigger>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Are you sure you want to quit?</DialogTitle>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={logout}>Yes, quit</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Replace the bare button in `LoggedHeader`**

In `src/components/header.tsx`, add the import at the top:

```tsx
import { QuitConfirmDialog } from "@/components/quit-confirm-dialog";
```

Then replace the bare `<button>` block:

```tsx
// Remove this:
<button type="button" className="flex items-center gap-x-2">
  Quit
  <img src="./icons/exit.svg" alt="" />
</button>

// Replace with:
<QuitConfirmDialog />
```

- [ ] **Step 3: Type-check**

Run: `npx tsc -b --noEmit`

Expected: no errors. Fix any type errors before continuing.

- [ ] **Step 4: Manual verification**

Run the dev server: `npm run dev`

Check:
1. The "Quit" button in the header looks identical to before (text + exit icon)
2. Clicking "Quit" opens a dialog with title "Are you sure you want to quit?"
3. Clicking "Cancel" closes the dialog — no logout, stays on dashboard
4. Clicking "Yes, quit" calls logout → redirects to `/login`

- [ ] **Step 5: Commit**

```bash
git add src/components/quit-confirm-dialog.tsx src/components/header.tsx
git commit -m "feat: add quit confirm dialog"
```

# Quit Confirm Dialog — Design Spec

**Date:** 2026-06-20

## Overview

Add a confirmation dialog to the "Quit" button in the logged-in header to prevent accidental logouts. Clicking "Quit" opens a dialog asking the user to confirm before logging out.

## Approach

Extract the confirmation dialog into a dedicated `QuitConfirmDialog` component (Option B). It is self-contained: owns its open/closed state, renders its own trigger, and calls `logout()` on confirm.

## Files

- **New:** `src/components/quit-confirm-dialog.tsx` — the dialog component
- **Modified:** `src/components/header.tsx` — replace bare `<button>` with `<QuitConfirmDialog />`

## Component: `QuitConfirmDialog`

### Trigger
Renders the existing "Quit" button (text + exit icon) as the `DialogTrigger`. Visual appearance is unchanged.

### Dialog content
- **Title:** "Are you sure you want to quit?"
- No description
- **Footer:**
  - "Cancel" button — `DialogClose`, variant `outline` — closes dialog, nothing happens
  - "Yes, quit" button — calls `useAuth().logout()`, variant `default`

### Data flow
`QuitConfirmDialog` → `useAuth().logout()` → clears `sessionStorage` → `navigate("/login")`

### Props
None — fully self-contained.

## Copy

| Element | Text |
|---|---|
| Dialog title | Are you sure you want to quit? |
| Cancel button | Cancel |
| Confirm button | Yes, quit |

## Out of scope
- Toast/feedback on cancel
- Any other logout entry points

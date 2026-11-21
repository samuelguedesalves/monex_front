# New transfer modal: real result step

**Why:** the last step always said "Transfer complete", but the backend settles
transactions asynchronously (Oban) and can refuse them (insufficient balance).

**Goals:** final step reflects the real status (`pending`/`processing` -> `done` | `refuse`).
**Non-goals:** backend changes, subscriptions, refusal reasons (API only exposes `status`).

**Approaches considered:** (1) poll `transaction(id)` from the modal - chosen, no backend change;
(2) close the modal and rely on the table - still lies/says nothing; (3) subscriptions - not in API.

**Design:** after `createTransaction`, go to a "Result" step showing "Processing...", poll
`transaction(id)` every 1s (15s timeout). `done` -> success, then `refreshUser` + `onTransferComplete`.
`refuse` -> "Transfer refused / insufficient balance" with Try again (back to Set Value).
Timeout/error -> "Still processing, check your transactions list". Stepper's last step is labelled
"Result" and its icon follows the outcome.

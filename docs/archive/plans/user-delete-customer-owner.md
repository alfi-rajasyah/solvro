# Deleting a user asks for new customer owners

Source: `docs/ISSUES.md`, "Penetration-test remediation (September 2026 report), follow-ups": a customer becomes unowned when its owner is deleted, and any TAM can then claim it.

## Decision

Decided by the user on 2026-11-12 (decisions log item D-10), option "Require reassignment": the user delete flow asks for a new owner for each customer the deleted user owns. The other option, "Block the delete", was not chosen.

## Contract

- `DELETE /admin/users/:id` takes an optional body `{ customers: [{ customerId, newOwnerId }] }`.
- The other blockers (projects as TAM or SA, assigned tasks, notes and so on) are checked first and still answer `400 user_in_use`.
- When the user owns a customer that has no choice in the body, the route answers `409 customer_owner_required` with `details.customers` (`id`, `name`).
- `newOwnerId` must be an active user who is not the deleted user (`400 owner_not_found` with `details.customerId`). A null owner is refused by validation.
- The owner changes and the delete run in one transaction. Locks are taken in the same order as the offboarding handover: owned customers by ascending id, then the user row.
- Each owner change is logged as `customer.owner_changed` after commit.
- Admin > Users > Delete loads the owned customers from `GET /admin/users/:id/handover-preview` and asks for an owner for each one before the confirm button is enabled.

## Out of scope

- The offboarding handover (`POST /admin/users/:id/offboard`) keeps its "No owner" choice. That also leaves a customer unowned; it is recorded in `docs/ISSUES.md`. Closed later the same day by `docs/archive/plans/offboard-customer-owner.md`.

## Delivery Gate

Run on 2026-11-12 against the built CI stack, with throwaway users and made-up customers. Result: PASS.

- PASS: no em dash in the visible copy of the five dialog states (loading, plain, owner picker before and after the choice, error).
- PASS: text is readable in both themes. The lowest contrast is 6.30:1 (dark) and 6.46:1 (light).
- PASS: at 375px the page and the open dialog have no horizontal scroll, and the dialog fills the screen.
- PASS: the Delete button shows "Loading…" while the customer list loads, then the dialog opens.
- PASS: the confirm button stays disabled until every customer has an owner; its label is "Move customers and delete".
- PASS: a user who owns no customers gets the plain dialog, with "Delete" enabled at once.
- PASS: the layout is correct in light and dark at 1440x900 and at 375px.

Note, not part of this change: at 1440px the Admin users table is wider than its container, so the Actions column is cut at the right edge ("Delete" reads "Delet"). The table scrolls inside itself. Not checked on `develop`.

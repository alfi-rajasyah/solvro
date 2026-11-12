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

- The offboarding handover (`POST /admin/users/:id/offboard`) keeps its "No owner" choice. That also leaves a customer unowned; it is recorded in `docs/ISSUES.md`.

## Delivery Gate

Pending: the click-through in both themes and at 375px is recorded here before the PR merges.

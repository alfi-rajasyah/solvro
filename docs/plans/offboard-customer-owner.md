# The offboarding handover asks for new customer owners

Source: `docs/ISSUES.md`, "Penetration-test remediation (September 2026 report), follow-ups": after `docs/archive/plans/user-delete-customer-owner.md`, the offboarding handover still had a "No owner" choice, which leaves a customer unowned and claimable by any TAM.

## Decision

Decided by the user on 2026-11-12 (decisions log item D-14), option "Require an owner": offboarding asks for a person for each owned customer, as user delete does. The other option, "Keep No owner for admins", was not chosen. The user approved the dialog prototype on the wireframe review page "Review: D-14 offboarding owner" before the code was written.

## Contract

- `POST /admin/users/:id/offboard`: each `customers[]` entry must have a numeric `newOwnerId`. A `null` is refused by validation (`400`). A customer missing from the body still answers `400 handover_incomplete`.
- The new owner must be an active user who is not the leaver (`400 owner_not_found` with `details.customerId`). Nothing else in the handover changes.
- Admin > Users > Hand over: each customer owner picker is required, with the empty option "Choose an owner". "Hand over and deactivate" stays disabled until every customer has an owner, and the hint "Choose a new owner for every customer <user> owns to continue." explains why.

## Delivery Gate

Pending.

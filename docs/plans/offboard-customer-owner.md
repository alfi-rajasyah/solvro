# The offboarding handover asks for new customer owners

Source: `docs/ISSUES.md`, "Penetration-test remediation (September 2026 report), follow-ups": after `docs/archive/plans/user-delete-customer-owner.md`, the offboarding handover still had a "No owner" choice, which leaves a customer unowned and claimable by any TAM.

## Decision

Decided by the user on 2026-11-12 (decisions log item D-14), option "Require an owner": offboarding asks for a person for each owned customer, as user delete does. The other option, "Keep No owner for admins", was not chosen. The user approved the dialog prototype on the wireframe review page "Review: D-14 offboarding owner" before the code was written.

## Contract

- `POST /admin/users/:id/offboard`: each `customers[]` entry must have a numeric `newOwnerId`. A `null` is refused by validation (`400`). A customer missing from the body still answers `400 handover_incomplete`.
- The new owner must be an active user who is not the leaver (`400 owner_not_found` with `details.customerId`). Nothing else in the handover changes.
- Admin > Users > Hand over: each customer owner picker is required, with the empty option "Choose an owner". "Hand over and deactivate" stays disabled until every customer has an owner, and the hint "Choose a new owner for every customer <user> owns to continue." explains why.

## Delivery Gate

Run on 2026-11-12 against the built CI stack, with a made-up TAM who leads one project and owns two made-up customers (Admin > Users > Deactivate). Result: PASS.

- PASS: no em dash in the visible copy, in light and dark at 1440x900 and at 375px.
- PASS: both owner pickers show "Choose an owner" with the required marker.
- PASS: "Hand over and deactivate" stays disabled at the start, after the new TAM is chosen, and after one of two owners; it is enabled after both.
- PASS: the hint "Choose a new owner for every customer <user> owns to continue." shows until every customer has an owner.
- PASS: no horizontal scroll at 375px, on the page and with the dialog open. The lowest text contrast is 4.57:1 (the light "Active" project chip, unchanged code).

Seen in unchanged code, not part of this change: at 1440px the "Apply to all" placeholder is cut by the select arrow.

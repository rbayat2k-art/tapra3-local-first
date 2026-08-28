# ADR-011 — Versioned Multi-Approval Rounds

> Status: ACCEPTED
> Date: 2026-08-28

## Context

Some approval stages require one decision, while others require every eligible reviewer or a fixed quorum. A role is an eligibility rule, not a durable voter list. Re-resolving a role queue after every click would let role changes silently change the denominator, lose concurrent votes, or make the last voter choose financial completion data.

## Decision

- An approval stage may declare `ANY`, `ALL`, or `N_OF_M` and an optional required count. A stage without the new field is a legacy single-decision stage and remains bound to its existing concrete assignee; it is not widened to a role-wide `ANY` queue.
- The first vote creates one deterministic, versioned approval round pinned to the record, module, workflow version, route, stage, and entry record version. The electorate is resolved from active accounts, active roles, permission, scope, maker-checker, specific-user or effective-manager policy and then frozen.
- `ANY` requires one positive vote, `ALL` requires every frozen seat, and `N_OF_M` requires an integer from one through the electorate size. An empty or impossible electorate fails closed.
- Votes are append-only and unique per user and round. Replaying the same command and payload returns the same result; reusing the command with different content conflicts. A negative or correction vote closes the round immediately in version 1 of this policy.
- A vote below threshold updates only the round. The business record version and status remain unchanged. The vote reaching threshold performs the business transition, history, audit, event, notification, idempotency receipt and any treasury handoff in the same read-write transaction.
- Completion intent that can affect money or destination is fingerprinted only by the first positive vote. Later positive voters cannot change it. Reject and correction votes remain independent veto decisions and close the round immediately. Purchase and employee-advance adapters preserve their existing specialized assignment and stage rules.
- Frozen membership is not permanent authority. Every vote rechecks current session, account, role template, permission, scope and maker-checker rules. QA access-view cannot vote.
- Deactivation or revocation never lowers the denominator. An unvoted seat becomes a continuity responsibility and the round is held as `needs_reassignment`. An authorized, audited continuity plan may replace only that unvoted seat with a user who is not already in the electorate; the round remains held until every blocked seat is repaired. Previous votes and makers remain immutable.
- Changing a user, role template, role scope or role status is rejected atomically when it would invalidate an unvoted frozen seat. The administrator must first complete the audited continuity replacement, preventing a silent denominator or authority change.
- Personnel unit, branch, position and sales-route transfers re-evaluate every open unvoted seat against the proposed personnel and linked-user assignment inside the same transaction. An invalidating transfer commits no personnel, account, audit or event write; an eligible transfer remains available.
- User access changes recheck the editor's live `organization.roles.assign` authority and direct-assignment restrictions after session validation inside the write transaction. Revoking that authority between the screen read and commit fails closed.
- Letter approval uses the approving user's current four-digit secondary password for each vote. Submission for review and final send remain separate operations; final delivery and the sender signature occur only after the approval round is complete.
- The seeded letter policy is itself publishable: its approval stage is `in_review`, is assigned to the active letter-reviewer role, and the completing vote moves the letter to `approved_for_send`. Administrators do not need to repair the default route before publishing its first version.
- Seed v1.41 repairs only the exact v1.40 machine-generated letter pattern that incorrectly placed one required, role-less stage at `approved_for_send`. It preserves that v1 definition in the historical-version store for already-pinned letters and publishes a validated v2 definition at `in_review`. User-published valid or invalid policies, and any lineage with a version collision, are never rewritten; invalid custom policies remain fail-closed until an authorized administrator publishes a valid revision.
- Policy publication also checks the historical-version store for the proposed next module version inside the same transaction. A collision aborts before definition, history, audit, event or command-receipt writes; an administrator must resolve the lineage rather than overwrite a version pinned by an in-flight record.
- Client projections expose only counts, pending identities and the current user's own vote. They omit the raw electorate, other votes and completion-intent hash. Internal command identifiers are always redacted; approval-vote history hides other voters' identity and reason unless resource-bound workflow-management authority is present.
- Publishing policies for employee advance, purchase request and letters is a session- and role-revalidated, optimistic-CAS command with a SHA-256 request receipt. Definition, immutable previous version, audit, event and metadata commit in one transaction; retries replay and concurrent publishers have one winner.
- Schema 14 adds the `workflow_approval_rounds` store. Imports from schema 11–13 accept the absent store and migrate additively without rewriting business records, workflow versions, or historical rows.

## Consequences

- Published workflow versions remain immutable and in-flight records continue on their pinned rule.
- Concurrent voters serialize on the round aggregate and exactly one vote performs the final transition/handoff.
- A correction or re-entry creates a new deterministic round at the new record version; closed-round votes remain historical and never count again.
- This local IndexedDB implementation validates transaction semantics on one browser profile. It does not claim server-grade multi-device throughput; the server implementation must preserve the same aggregate, receipt, and serialization contract.

## Alternatives rejected

- Counting active role members on every vote: silently changes quorum and breaks auditability.
- Treating legacy stages as explicit role-wide `ANY`: widens authority beyond the previously assigned user.
- Writing pending votes into the business record: creates avoidable optimistic-lock conflicts and loses concurrent intent.
- Letting an administrator bypass the frozen electorate or maker-checker: converts administration into untracked financial authority.
- Shrinking the denominator when a voter leaves: turns personnel changes into silent policy changes.

## References

- [Local command concurrency](ADR-008-local-command-concurrency.md)
- [Work continuity and deactivation](ADR-009-work-continuity-deactivation.md)
- [Acting manager workflow routing](ADR-010-acting-manager-workflow-routing.md)

# SourceHub User Acceptance Test Plan

Status: Awaiting authorised business testing

This plan is a template, not an approval record. A scenario is not passed until an authorised tester records the actual result and evidence.

## Test Record Template

Use this record for every scenario:

| Field | Value |
| --- | --- |
| Scenario ID |  |
| Preconditions |  |
| User role |  |
| Steps |  |
| Expected result |  |
| Actual result |  |
| Pass or fail | Awaiting test |
| Evidence | Screenshot, request ID, or test data reference |
| Defect reference |  |
| Tester |  |
| Test date |  |

## Scenarios

| ID | Role | Scenario | Expected result | Status |
| --- | --- | --- | --- | --- |
| UAT-01 | Platform administrator | Sign in, review dashboard, sign out | Authenticated session opens the permitted workspace and logout clears access | Awaiting test |
| UAT-02 | Platform administrator | Create and disable a user | User lifecycle is validated, audited, and disabled access is rejected | Awaiting test |
| UAT-03 | Service desk administrator | Create, assign, update, resolve, and close a ticket | Ticket status workflow, SLA evidence, comments, attachments, and audit history are correct | Awaiting test |
| UAT-04 | Technician | View assigned work and add a ticket update | Technician sees only permitted work and cannot change protected fields | Awaiting test |
| UAT-05 | Manager | Review SLA escalation and approve an exception | Approval is required for controlled actions and result is audited | Awaiting test |
| UAT-06 | Finance user | Create a quote, invoice, payment, and report | Integer minor-unit totals, VAT, allocation, permissions, and exports are correct | Awaiting test |
| UAT-07 | HR user | Onboard and offboard an employee | Required records, retention state, permissions, and sensitive fields are protected | Awaiting test |
| UAT-08 | Employee | Check attendance in and out | Consent-based check-in works; location is event-only and not continuous monitoring | Awaiting test |
| UAT-09 | Client user | View portal ticket and approved Knowledge Base content | Client scope cannot cross into another client or tenant | Awaiting test |
| UAT-10 | Asset administrator | Register, assign, audit, and retire an asset | Asset lifecycle transitions and assignment history are preserved | Awaiting test |
| UAT-11 | Network administrator | Run an endpoint audit and review an alert | Audit input is bounded, credentials are not exposed, and alerts are actionable | Awaiting test |
| UAT-12 | Project manager | Create project, tasks, dependency, risk, and time entry | Workflow transitions, dependency validation, approvals, and progress are correct | Awaiting test |
| UAT-13 | Knowledge administrator | Draft, review, publish, and retire an article | Unsafe markup and links are rejected; visibility and feedback are scoped | Awaiting test |
| UAT-14 | Report user | Open report, save view, export, and schedule | Permission-specific reports and bounded exports work; formulas are neutralised | Awaiting test |
| UAT-15 | AI-enabled user | Ask a permitted question and request a draft | Retrieval is permission-checked, tenant-scoped, redacted, audited, and never performs an unconfirmed mutation | Awaiting test |
| UAT-16 | Automation approver | Dry-run, publish, approve, retry, and disable a workflow | Only registered actions run; high-risk actions wait for approval and retries are idempotent | Awaiting test |
| UAT-17 | Tenant owner | Invite member, switch tenant, review entitlements, and request export | Membership, tenant boundary, quota, support visibility, and export scope are correct | Awaiting test |
| UAT-18 | Read-only auditor | Review audit, security, and continuity evidence | Auditor can read permitted evidence and cannot mutate records | Awaiting test |
| UAT-19 | Mobile technician | Sign in, bootstrap, work offline, sync, upload, and receive notification | Offline mutations are bounded and idempotent; conflicts require review | Awaiting test |
| UAT-20 | API integrator | Authenticate with a scoped API credential and paginate tickets | Workspace, client scope, rate limit, correlation ID, and error handling are correct | Awaiting test |

## Sign-off Template

```text
Release: SourceHub Phase 18
Environment:
Test data / tenant:
Scenarios passed:
Scenarios failed:
Open defects:
Known limitations accepted:
Business owner:
Technical owner:
Business approval: PENDING
Technical approval: PENDING
Approval date:
Notes:
```

# Phase 20 Guided Demo Scenarios

All scenarios are non-destructive and should run against synthetic data or an approved non-production workspace. Reset only marked demo records.

## Service Desk

- Preconditions: synthetic client, category, SLA, service desk manager, and technician.
- Steps: submit request, triage, assign, verify SLA, add note, resolve, confirm, review report.
- Expected: authorised, audited, tenant-scoped, retry-safe lifecycle.

## Asset Management

- Preconditions: synthetic asset type and employee.
- Steps: create, assign, inspect warranty, transfer, review history.
- Expected: protected fields remain protected and history is retained.

## Employee and Attendance

- Preconditions: synthetic employee and approved schedule.
- Steps: legitimate check-in, exception if needed, manager review, report review.
- Expected: no continuous tracking, idle monitoring, screenshots, or application tracking.

## Projects

- Preconditions: synthetic project team.
- Steps: create project, assign task, milestone, record time, update progress, report.
- Expected: bounded integer minutes and preserved tenant scope.

## Finance

- Preconditions: approved synthetic finance record.
- Steps: inspect record, validate minor-unit totals, review permissions and audit trail.
- Expected: no provider or real recipient is contacted; exports are formula-safe.

## Knowledge and AI

- Preconditions: approved synthetic article and authorised AI permissions.
- Steps: approve article, search, retrieve permitted content, submit injection attempt, request high-risk action.
- Expected: scoped retrieval, safe injection rejection, confirmation for high-risk action.

## Automation

- Preconditions: approved draft workflow and test trigger.
- Steps: trigger, evaluate, execute once, inspect audit, retry.
- Expected: idempotency prevents duplicates and unsafe actions remain gated.

## Tenant Isolation

- Preconditions: two synthetic tenants with similar records.
- Steps: try cross-tenant URL, Firestore query, Storage path, search, export, API, AI, automation, and notification access.
- Expected: every cross-tenant action is denied or returns no data.

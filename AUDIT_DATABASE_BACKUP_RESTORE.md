# Database Backup Enforcement (Audit)

This project includes **application-level** backup + restore testing for the
Postgres database, plus **provider-level** backup configuration
requirements.

## Audit Requirements (What we enforce)

1. **Daily backups**
2. **30-day retention**
3. **Monthly restore testing**
4. **Restore testing must run and produce evidence** (logs/records)

## How our application meets the requirements

### 1) Daily backups

File: `src/backup/backupService.ts`

- Backups are written as `pg_dump` files into `BACKUP_DIR`
- Schedule is enforced by `BACKUP_CRON_SCHEDULE` and validated at startup by `src/backup/backupConfig.ts`
- Enforced audit constraint:
  - `BACKUP_CRON_SCHEDULE` must be **daily**, i.e. `dom="*"` and `dow="*"` in
    the 5-field node-cron string.

Default (and enforced in code):

- `BACKUP_CRON_SCHEDULE="10 2 * * *"` (02:10 UTC daily)

### 2) 30-day retention

File: `src/backup/backupService.ts` + `src/backup/backupConfig.ts`

- Retention cleanup deletes local `.dump` backups older than `BACKUP_RETENTION_DAYS`.
- Enforced audit constraint:
  - `BACKUP_RETENTION_DAYS` must be **exactly 30**. The server fails fast if not.

Default:

- `BACKUP_RETENTION_DAYS=30`

### 3) Monthly restore testing

File: `src/backup/restoreTestService.ts` + route
`src/controllers/backup.controller.ts` (manual trigger)

- A monthly cron restores data from the latest available dump in `BACKUP_DIR` into
  a temporary database.
- Then it validates expected tables using `BACKUP_RESTORE_VALIDATION_TABLES`
  and optionally
  row counts using `BACKUP_RESTORE_MIN_ROWS`.
- Enforced audit constraint:
  - `BACKUP_RESTORE_TEST_CRON_SCHEDULE` must be **monthly**, enforced
    at startup (mon="*",
    dow="*", dom must be a number 1–31).

Default (and enforced in code):

- `BACKUP_RESTORE_TEST_CRON_SCHEDULE="30 3 1 * *"` (03:30 UTC on the 1st of
  every month)

### 4) Restore testing evidence (no restore testing = audit failure)

Evidence is produced in two places:

**A) Primary evidence: Prisma auditLog table**
File: `src/services/auditLog.ts` using `prisma.auditLog.create(...)`

Restore test log actions:

- `DB_RESTORE_TEST_STARTED`
- `DB_RESTORE_TEST_COMPLETED`
- `DB_RESTORE_TEST_VALIDATION_FAILED`
- `DB_RESTORE_TEST_FAILED`

Backup log actions:

- `DB_BACKUP_OK` (written in `runBackupOnce()`)
- `DB_BACKUP_COMPLETED` (written by the cron handler)
- `DB_BACKUP_FAILED` (written by the cron handler)

**B) Fallback evidence: JSONL file**
If Prisma audit logging fails, we append to:

- `${BACKUP_DIR}/audit_evidence_fallback.jsonl`

## Provider-Level Configuration (Supabase / AWS RDS / Railway / PlanetScale)

> Note: Provider backup retention/testing are still required by your
> auditors. Our application cron enforces
> the **audit schedule** and produces **restore test evidence**.
> For each provider, configure their managed backups accordingly, then rely on
> the app’s restore testing to demonstrate periodic restores.

### Supabase

Checklist:

- Enable **Automated Backups**
- Configure retention to **30 days**
- Ensure backups are scheduled **daily**
- Confirm you can restore to a specific point-in-time if your audit requires it

Evidence you provide:

- Provider backup configuration screenshot/settings
- Our app’s restore test evidence:
  - Restore test cron schedule: `BACKUP_RESTORE_TEST_CRON_SCHEDULE="30 3 1 * *"`
  - Restore test log actions in `auditLog` or fallback JSONL

### AWS RDS (Postgres)

Checklist:

- Enable **Automated Backups** with:
  - Backup retention period: **30 days**
  - Backups occur **daily**
- Confirm retention window matches auditor requirement
- Ensure automated backups are enabled at the instance level

Evidence you provide:

- RDS settings showing retention=30 and automated backups enabled
- Our app’s restore test evidence (actions listed above)

### Railway (Postgres)

Checklist:

- Enable managed backups / scheduled backups
- Set retention to **30 days**
- Confirm daily backup frequency

Evidence you provide:

- Railway settings screenshot for backups and retention
- Our app’s restore test evidence

### PlanetScale

PlanetScale uses branch-based workflows rather than “classic daily snapshots”.
Checklist (audit-friendly approach):

- Ensure you have a **daily** backup/export mechanism (e.g., automated branch or
  export)
- Maintain **30 days** of retention of backup artifacts
- Establish a monthly restore validation step

Evidence you provide:

- PlanetScale workflow/config proving daily backup and 30-day retention
- Our app’s restore test evidence (monthly cron + log actions)

## Required Configuration Summary (must match enforced code defaults)

In `ledgera-backend/.env` or your deployment env vars:

- `BACKUP_DIR="./backups"`
- `BACKUP_RETENTION_DAYS=30` ✅ (code-enforced)
- `BACKUP_CRON_SCHEDULE="10 2 * * *"` ✅ (daily; code-enforced)
- `BACKUP_RESTORE_TEST_ENABLED="true"`
- `BACKUP_RESTORE_TEST_CRON_SCHEDULE="30 3 1 * *"` ✅ (monthly; code-enforced)
- `BACKUP_RESTORE_VALIDATION_TABLES="Company,Job,Payment,Contract,Invoice"`
- `BACKUP_RESTORE_MIN_ROWS=0`

## Operational Notes (important for auditors)

- The restore-test cron restores **from `BACKUP_DIR` dumps**.
  Ensure `BACKUP_DIR` is populated by the daily backup cron (and persisted across
  restarts if needed).
- The restore test is scheduled monthly by default, but it is also available as
  a manual endpoint (admin-only):
  - `POST /admin/restore-test`

## Audit Evidence Locations

- Primary: database table `auditLog` with action names listed above.
- Fallback: `${BACKUP_DIR}/audit_evidence_fallback.jsonl`

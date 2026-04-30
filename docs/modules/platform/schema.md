# Platform Schema

## `platform.platform_audit_log`

Append-only audit spine for cross-module security and operations events.

Identity & Access currently writes:

- user create/update/deactivate
- password change/reset
- login/logout/session events
- role assignment/revocation
- store-scope grant/revocation
- MFA-factor revocation

Columns include actor, session, resource, outcome, reason, request metadata, before/after JSON, event metadata, trace id, and timestamp. Platform owns retention, search, and future export/archival behavior.

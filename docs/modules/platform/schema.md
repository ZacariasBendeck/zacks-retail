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

## `platform.platform_request_trace`

Slow/error request summary table for API observability.

Rows are persisted only for requests above the configured slow threshold, 5xx responses, or all requests when `REQUEST_TRACE_PERSIST_ALL` is enabled. The table stores request and trace IDs, method, route/original URL, status, duration, optional actor/session IDs, safe error fields, and request timing JSON. It intentionally does not store request bodies, response bodies, cookies, raw auth headers, or SQL parameters.

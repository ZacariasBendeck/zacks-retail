# Platform API

## Shared audit log

- `GET /api/v1/platform/audit`
- `GET /api/v1/platform/audit/:id`

Supported list filters:

- `actorUserId`
- `eventType`
- `outcome`
- `resourceType`
- `resourceId`
- `createdFrom`
- `createdTo`
- `limit` (1-200)

The first consumer is Identity & Access, so the current permission gate is `identity_access.view`. A later platform administration slice can split this into a dedicated platform audit permission if the app needs finer separation.

## Request traces

- `GET /api/v1/platform/request-traces`
- `GET /api/v1/platform/request-traces/:id`

Supported list filters:

- `traceId`
- `requestId`
- `method`
- `route`
- `statusMin`
- `minDurationMs`
- `createdFrom`
- `createdTo`
- `limit` (1-200)

These rows are slow/error request summaries used to correlate browser-visible failures and slow API calls with structured logs. The current permission gate is also `identity_access.view`.

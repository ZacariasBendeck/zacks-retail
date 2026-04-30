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

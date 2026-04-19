# Category And Department Filter Contract

## Canonical Domain

- Departments are fixed to: `FORMAL`, `CASUAL`, `FIESTA`, `SANDALIAS`, `BOOTS`, `COMFORT`.
- Category code domain is fixed to RICS codes `556-599`.
- Report query parameter `category` is the **RICS category code** (not the internal FK id).

## Canonical Selector Payload (Frontend)

Source endpoint: `GET /api/v1/skus/reference/categories`

Each category row must expose:

- `id` (`number`): internal FK id for write operations on SKU records (`skus.category_id`).
- `ricsCode` (`number`): business category code used in reporting filters (`556-599`).
- `name` (`string`): category label.
- `deptMacro` (`'FORMAL' | 'CASUAL' | 'FIESTA' | 'SANDALIAS' | 'BOOTS' | 'COMFORT'`): canonical macro group.
- `active` (`boolean`): active flag.

## Frontend Usage Rules

- SKU create/update forms send `categoryId` (internal FK `id`) for persistence endpoints.
- Report filters send `category` as `ricsCode` to report endpoints.
- Category selector grouping is derived from `deptMacro`.

Recommended normalized view model for selectors:

```ts
type CategorySelectorOption = {
  id: number
  ricsCode: number
  name: string
  deptMacro: 'FORMAL' | 'CASUAL' | 'FIESTA' | 'SANDALIAS' | 'BOOTS' | 'COMFORT'
}
```

## Report API Contract

- All `/api/v1/reports/*` routes validate `category` as integer in range `556-599`.
- Report responses expose `category` as RICS code values to keep UI drill-down consistent with filter inputs.
- Server internally resolves code -> FK id before executing SQL filters.

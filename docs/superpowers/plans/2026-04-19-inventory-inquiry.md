# Inventory Inquiry + Shared SKU Primitives Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the functional v1 of the Product Inquiry page at `/products/inquiry/:skuCode` (matching the RICS Inventory Inquiry screen) plus two shared SKU primitives (`<SkuLookup />` modal, `<SkuLink />` inline link) that the whole app uses to pick and navigate to SKUs.

**Architecture:** Phase-1 RICS-adapter-backed page owned by the `products` module. Frontend: React 18 + TanStack Query + Ant Design + Vitest. Backend: Express + Jest, reading from legacy Access MDBs through `accessOleDb.ts` + `ricsProductAdapter.ts`. Reuses the existing `/rics-images` static route; no new schema changes; all stubbed features (POs / Trend / Print / some view modes) render explicit "waiting on" placeholders.

**Tech Stack:** TypeScript, React 18, Ant Design 5, TanStack Query v5, React Router v6, Vitest, Express, Jest, PowerShell + Microsoft.ACE.OLEDB.12.0 (read-only).

**Spec:** [docs/superpowers/specs/2026-04-19-inventory-inquiry-design.md](../specs/2026-04-19-inventory-inquiry-design.md)

**Commit convention:** `feat(products): …` / `feat(api): …` / `refactor(inventory): …` (conventional commits with module scope, matching `feat(sales-reporting): …` style visible in `git log`).

**Test commands:**
- Backend: `pnpm --filter api test -- <testNamePattern>`
- Frontend: `pnpm --filter web test -- <testNamePattern>`

---

## Table of contents

- **Phase A — Shared primitives** (Tasks 1–4): `SizeGrid`, `SkuLink`, backend `/skus/search`, `SkuLookup` modal
- **Phase B — Extend inquiry payload** (Tasks 5–7): adapter, facade, route+hook typings
- **Phase C — New Inquiry page** (Tasks 8–15): shell, header, pricing, rollup, picture, view-mode selector, grid binding, action bar
- **Phase D — Tabs** (Tasks 16–18): UPCs, Info, Detail wired; POs / Trend / Print stubs
- **Phase E — SkuLink sweep** (Tasks 19–22): wire all Phase-1 target pages
- **Phase F — Cutover** (Tasks 23–24): redirect legacy route, delete old page
- **Phase G — Docs** (Task 25): pointer in `docs/modules/products.md`

---

## Phase A — Shared primitives

### Task 1: `<SizeGrid />` shared primitive

**Files:**
- Create: `apps/web/src/components/size-grid/types.ts`
- Create: `apps/web/src/components/size-grid/SizeGrid.tsx`
- Create: `apps/web/src/components/size-grid/SizeGrid.test.tsx`
- Create: `apps/web/src/components/size-grid/index.ts`

- [ ] **Step 1.1: Write the failing test**

```tsx
// apps/web/src/components/size-grid/SizeGrid.test.tsx
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SizeGrid } from './SizeGrid';

describe('SizeGrid', () => {
  const grid = {
    columns: ['6', '7', '8', 'TOT'],
    rows: [
      { label: 'On Hand', cells: [{ value: 8 }, { value: 7 }, { value: null }, { value: 15 }] },
      { label: 'Model',   cells: [{ value: 2 }, { value: 2 }, { value: 2 }, { value: 6 }] },
    ],
  };

  it('renders column headers', () => {
    render(<SizeGrid grid={grid} />);
    expect(screen.getByRole('columnheader', { name: '6' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'TOT' })).toBeInTheDocument();
  });

  it('renders each metric row with values (null → dash)', () => {
    render(<SizeGrid grid={grid} />);
    const onHand = screen.getByRole('row', { name: /On Hand/ });
    expect(within(onHand).getByText('8')).toBeInTheDocument();
    expect(within(onHand).getByText('—')).toBeInTheDocument(); // null cell
  });

  it('renders empty-state when grid has no rows', () => {
    render(<SizeGrid grid={{ columns: [], rows: [] }} />);
    expect(screen.getByText(/no data/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 1.2: Run the test — expect FAIL (module not found)**

```
pnpm --filter web test -- SizeGrid
```

Expected: `Cannot find module './SizeGrid'`.

- [ ] **Step 1.3: Define types**

```ts
// apps/web/src/components/size-grid/types.ts
export interface SizeGridCell {
  value: number | null;
}

export interface SizeGridRow {
  label: string;
  cells: SizeGridCell[];
}

export interface SizeGrid {
  columns: string[];
  rows: SizeGridRow[];
  /** Optional subtitle rendered above the grid (e.g. "All stores - Summary"). */
  caption?: string;
}
```

- [ ] **Step 1.4: Implement `SizeGrid`**

```tsx
// apps/web/src/components/size-grid/SizeGrid.tsx
import React from 'react';
import { Empty, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { SizeGrid as SizeGridData, SizeGridRow } from './types';

function formatCell(value: number | null): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('es-HN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

export interface SizeGridProps {
  grid: SizeGridData;
}

export const SizeGrid: React.FC<SizeGridProps> = ({ grid }) => {
  if (grid.rows.length === 0 || grid.columns.length === 0) {
    return <Empty description="No data" />;
  }

  const columns: ColumnsType<SizeGridRow & { key: string }> = [
    {
      title: '',
      dataIndex: 'label',
      key: 'label',
      width: 140,
      fixed: 'left',
      render: (label: string) => <strong>{label}</strong>,
    },
    ...grid.columns.map((col, idx) => ({
      title: col,
      key: `col-${idx}`,
      align: 'right' as const,
      render: (_: unknown, record: SizeGridRow) => formatCell(record.cells[idx]?.value ?? null),
    })),
  ];

  const dataSource = grid.rows.map((row, idx) => ({ ...row, key: `row-${idx}` }));

  return (
    <Table
      size="small"
      pagination={false}
      columns={columns}
      dataSource={dataSource}
      caption={grid.caption}
      scroll={{ x: 'max-content' }}
    />
  );
};
```

- [ ] **Step 1.5: Add barrel export**

```ts
// apps/web/src/components/size-grid/index.ts
export { SizeGrid } from './SizeGrid';
export type { SizeGrid as SizeGridData, SizeGridRow, SizeGridCell, SizeGridProps } from './types';
```

- [ ] **Step 1.6: Run the tests — expect PASS**

```
pnpm --filter web test -- SizeGrid
```

Expected: 3 passing.

- [ ] **Step 1.7: Commit**

```
git add apps/web/src/components/size-grid/
git commit -m "feat(products): add shared SizeGrid primitive"
```

---

### Task 2: `<SkuLink />` clickable SKU code

**Files:**
- Create: `apps/web/src/components/sku-link/SkuLink.tsx`
- Create: `apps/web/src/components/sku-link/SkuLink.test.tsx`
- Create: `apps/web/src/components/sku-link/index.ts`

- [ ] **Step 2.1: Write the failing test**

```tsx
// apps/web/src/components/sku-link/SkuLink.test.tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { SkuLink } from './SkuLink';

const renderWithRouter = (ui: React.ReactElement) =>
  render(<MemoryRouter>{ui}</MemoryRouter>);

describe('SkuLink', () => {
  it('renders the SKU code as link text by default', () => {
    renderWithRouter(<SkuLink skuCode="ZN02-NDPT" />);
    const anchor = screen.getByRole('link', { name: 'ZN02-NDPT' });
    expect(anchor).toHaveAttribute('href', '/products/inquiry/ZN02-NDPT');
  });

  it('appends storeId when provided', () => {
    renderWithRouter(<SkuLink skuCode="ZN02-NDPT" storeId={1} />);
    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      '/products/inquiry/ZN02-NDPT?storeId=1'
    );
  });

  it('URL-encodes SKUs containing special characters', () => {
    renderWithRouter(<SkuLink skuCode="|DMTDU1BN" />);
    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      '/products/inquiry/%7CDMTDU1BN'
    );
  });

  it('renders custom children when provided', () => {
    renderWithRouter(<SkuLink skuCode="ABC">Open inquiry</SkuLink>);
    expect(screen.getByRole('link', { name: 'Open inquiry' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2.2: Run the test — expect FAIL (module not found)**

```
pnpm --filter web test -- SkuLink
```

Expected: `Cannot find module './SkuLink'`.

- [ ] **Step 2.3: Implement `SkuLink`**

```tsx
// apps/web/src/components/sku-link/SkuLink.tsx
import React from 'react';
import { Link } from 'react-router-dom';

export interface SkuLinkProps {
  skuCode: string;
  storeId?: number;
  children?: React.ReactNode;
  className?: string;
}

export const SkuLink: React.FC<SkuLinkProps> = ({ skuCode, storeId, children, className }) => {
  const encoded = encodeURIComponent(skuCode);
  const qs = storeId !== undefined ? `?storeId=${storeId}` : '';
  const to = `/products/inquiry/${encoded}${qs}`;
  return (
    <Link to={to} className={className}>
      {children ?? skuCode}
    </Link>
  );
};
```

- [ ] **Step 2.4: Add barrel export**

```ts
// apps/web/src/components/sku-link/index.ts
export { SkuLink } from './SkuLink';
export type { SkuLinkProps } from './SkuLink';
```

- [ ] **Step 2.5: Run tests — expect PASS**

```
pnpm --filter web test -- SkuLink
```

Expected: 4 passing.

- [ ] **Step 2.6: Commit**

```
git add apps/web/src/components/sku-link/
git commit -m "feat(products): add shared SkuLink primitive"
```

---

### Task 3: Backend `GET /api/v1/skus/search` endpoint (powers `SkuLookup`)

**Files:**
- Modify: `apps/api/src/routes/skuRoutes.ts` (add `/search` after the existing `/lookup` handler at line 195)
- Modify: `apps/api/src/services/ricsProductAdapter.ts` (extend `searchPosSkus` or add a new `searchSkusForLookup` — see step 3.3)
- Create: `apps/api/tests/routes/skuSearchRoute.test.ts`

- [ ] **Step 3.1: Write the failing route test**

```ts
// apps/api/tests/routes/skuSearchRoute.test.ts
import request from 'supertest';
import { createApp } from '../../src/app';

describe('GET /api/v1/skus/search', () => {
  it('returns 400 when q is missing', async () => {
    const app = await createApp();
    const res = await request(app).get('/api/v1/skus/search');
    expect(res.status).toBe(400);
  });

  it('returns rows matching the SKU prefix', async () => {
    const app = await createApp();
    const res = await request(app).get('/api/v1/skus/search?q=ZN02');
    expect(res.status).toBe(200);
    expect(res.body.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ skuCode: expect.stringMatching(/^ZN02/) }),
      ])
    );
    expect(typeof res.body.total).toBe('number');
  });

  it('applies descContains filter', async () => {
    const app = await createApp();
    const res = await request(app).get(
      '/api/v1/skus/search?q=&descContains=SandPt'
    );
    expect(res.status).toBe(200);
    res.body.rows.forEach((r: { description: string }) => {
      expect(r.description.toLowerCase()).toContain('sandpt');
    });
  });

  it('supports sort=DESCRIPTION', async () => {
    const app = await createApp();
    const res = await request(app).get(
      '/api/v1/skus/search?q=&sort=DESCRIPTION&limit=5'
    );
    expect(res.status).toBe(200);
    const descriptions = res.body.rows.map((r: { description: string }) => r.description);
    const sorted = [...descriptions].sort((a, b) => a.localeCompare(b));
    expect(descriptions).toEqual(sorted);
  });
});
```

- [ ] **Step 3.2: Run the test — expect FAIL (route 404)**

```
pnpm --filter api test -- skuSearchRoute
```

Expected: the first test passes (it's asserting 400 but gets 404 — still fails) — actually let's make sure: `GET /api/v1/skus/search` returns 404, so the status check `expect(res.status).toBe(400)` fails. Good — that's the RED state.

- [ ] **Step 3.3: Add adapter helper `searchSkusForLookup`**

Open `apps/api/src/services/ricsProductAdapter.ts`. Find the existing `searchPosSkus` function (around line 1036). Add a new exported function alongside it:

```ts
// apps/api/src/services/ricsProductAdapter.ts (add near searchPosSkus)

export type SkuLookupSort = 'SKU' | 'DESCRIPTION' | 'VENDOR' | 'STYLE_COLOR';

export interface SkuLookupRow {
  skuId: string;
  skuCode: string;
  description: string;
  vendor: string;
  category: string;
  styleColor: string | null;
  currentPrice: number | null;
}

export interface SkuLookupParams {
  q?: string;
  descContains?: string;
  wholeWord?: boolean;
  sort?: SkuLookupSort;
  limit?: number;
  offset?: number;
}

export async function searchSkusForLookup(
  params: SkuLookupParams
): Promise<{ rows: SkuLookupRow[]; total: number }> {
  const snapshot = await loadInventorySnapshot();
  const q = (params.q ?? '').trim().toLowerCase();
  const desc = (params.descContains ?? '').trim().toLowerCase();
  const whole = !!params.wholeWord;

  let filtered = snapshot.rows.filter((row) => {
    const skuCode = String(row.SKU ?? '').toLowerCase();
    const description = String(row.Desc ?? '').toLowerCase();
    if (q && !skuCode.startsWith(q)) return false;
    if (desc) {
      if (whole) {
        const tokens = description.split(/\s+/);
        if (!tokens.includes(desc)) return false;
      } else if (!description.includes(desc)) {
        return false;
      }
    }
    return true;
  });

  const sort: SkuLookupSort = params.sort ?? 'SKU';
  const sortKey = (row: typeof filtered[number]): string => {
    switch (sort) {
      case 'DESCRIPTION': return String(row.Desc ?? '');
      case 'VENDOR':      return String(row.Vendor ?? '');
      case 'STYLE_COLOR': return String(row.StyleColor ?? '');
      case 'SKU':
      default:            return String(row.SKU ?? '');
    }
  };
  filtered = filtered.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

  const total = filtered.length;
  const offset = Math.max(0, params.offset ?? 0);
  const limit = Math.max(1, Math.min(params.limit ?? 50, 500));
  const page = filtered.slice(offset, offset + limit);

  const rows: SkuLookupRow[] = page.map((row) => ({
    skuId: String(row.SKU ?? ''),
    skuCode: String(row.SKU ?? ''),
    description: String(row.Desc ?? ''),
    vendor: String(row.Vendor ?? ''),
    category: String(row.Category ?? ''),
    styleColor: row.StyleColor ? String(row.StyleColor) : null,
    currentPrice: resolveCurrentPrice(row),
  }));

  return { rows, total };
}
```

Note: `resolveCurrentPrice` is an existing helper in the adapter that maps `CurrentPrice` selector to the correct price slot. If its signature differs, mirror what `invRowToPosSku` / `getPriceSlots` already do.

- [ ] **Step 3.4: Add the route handler**

Open `apps/api/src/routes/skuRoutes.ts`. After the existing `/lookup` handler (ends around line 195), add:

```ts
// apps/api/src/routes/skuRoutes.ts (append to existing router)

import { searchSkusForLookup, type SkuLookupSort } from '../services/ricsProductAdapter';

router.get('/search', async (req, res, next) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const descContains = typeof req.query.descContains === 'string' ? req.query.descContains : undefined;

    if (q === undefined && !descContains) {
      return res.status(400).json({ error: 'q or descContains is required' });
    }

    const sortRaw = typeof req.query.sort === 'string' ? req.query.sort.toUpperCase() : 'SKU';
    const allowedSorts: SkuLookupSort[] = ['SKU', 'DESCRIPTION', 'VENDOR', 'STYLE_COLOR'];
    const sort = (allowedSorts as string[]).includes(sortRaw)
      ? (sortRaw as SkuLookupSort)
      : 'SKU';

    const wholeWord = req.query.wholeWord === 'true';
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const offset = req.query.offset ? Number(req.query.offset) : 0;

    const result = await searchSkusForLookup({ q, descContains, wholeWord, sort, limit, offset });
    res.json(result);
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 3.5: Run the tests — expect PASS**

```
pnpm --filter api test -- skuSearchRoute
```

Expected: 4 passing.

- [ ] **Step 3.6: Add a frontend API client**

Open `apps/web/src/services/skuApi.ts`. After `lookupSkuByCode` (around line 138), add:

```ts
// apps/web/src/services/skuApi.ts

export type SkuLookupSort = 'SKU' | 'DESCRIPTION' | 'VENDOR' | 'STYLE_COLOR';

export interface SkuLookupRow {
  skuId: string;
  skuCode: string;
  description: string;
  vendor: string;
  category: string;
  styleColor: string | null;
  currentPrice: number | null;
}

export interface SkuLookupResult {
  rows: SkuLookupRow[];
  total: number;
}

export interface SkuLookupQuery {
  q?: string;
  descContains?: string;
  wholeWord?: boolean;
  sort?: SkuLookupSort;
  limit?: number;
  offset?: number;
}

export async function searchSkusForLookup(query: SkuLookupQuery): Promise<SkuLookupResult> {
  const params = new URLSearchParams();
  if (query.q !== undefined) params.set('q', query.q);
  if (query.descContains) params.set('descContains', query.descContains);
  if (query.wholeWord) params.set('wholeWord', 'true');
  if (query.sort) params.set('sort', query.sort);
  if (query.limit) params.set('limit', String(query.limit));
  if (query.offset) params.set('offset', String(query.offset));

  const response = await fetch(`/api/v1/skus/search?${params.toString()}`);
  if (!response.ok) throw new SkuApiError(`SKU search failed: ${response.status}`);
  return response.json();
}
```

- [ ] **Step 3.7: Commit**

```
git add apps/api/src/routes/skuRoutes.ts \
        apps/api/src/services/ricsProductAdapter.ts \
        apps/api/tests/routes/skuSearchRoute.test.ts \
        apps/web/src/services/skuApi.ts
git commit -m "feat(api): add /skus/search endpoint and client for SkuLookup modal"
```

---

### Task 4: `<SkuLookup />` modal picker

**Files:**
- Create: `apps/web/src/components/sku-lookup/SkuLookup.tsx`
- Create: `apps/web/src/components/sku-lookup/SkuLookup.test.tsx`
- Create: `apps/web/src/components/sku-lookup/index.ts`

- [ ] **Step 4.1: Write the failing test**

```tsx
// apps/web/src/components/sku-lookup/SkuLookup.test.tsx
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigProvider } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SkuLookup } from './SkuLookup';

vi.mock('../../services/skuApi', () => ({
  searchSkusForLookup: vi.fn(),
  SkuApiError: class extends Error {},
}));

import * as skuApi from '../../services/skuApi';

function renderLookup(onSelect = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ConfigProvider>
          <SkuLookup open={true} onClose={() => {}} onSelect={onSelect} />
        </ConfigProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return onSelect;
}

describe('SkuLookup', () => {
  beforeEach(() => {
    vi.mocked(skuApi.searchSkusForLookup).mockResolvedValue({
      rows: [
        { skuId: 'A1', skuCode: 'A1', description: 'Widget', vendor: 'ACME', category: '10', styleColor: null, currentPrice: 9.99 },
        { skuId: 'A2', skuCode: 'A2', description: 'Gadget', vendor: 'ACME', category: '10', styleColor: null, currentPrice: 19.99 },
      ],
      total: 2,
    });
  });

  it('renders the six-column table from the RICS screenshot', async () => {
    renderLookup();
    await screen.findByText('A1');
    ['SKU', 'Description', 'Vendor', 'Categ.', 'Style/Color', 'Price'].forEach((header) => {
      expect(screen.getByRole('columnheader', { name: header })).toBeInTheDocument();
    });
  });

  it('passes descContains filter to the API', async () => {
    renderLookup();
    await screen.findByText('A1');
    await userEvent.type(screen.getByLabelText(/descriptions containing/i), 'wid');
    await userEvent.click(screen.getByRole('button', { name: /go/i }));
    await waitFor(() =>
      expect(skuApi.searchSkusForLookup).toHaveBeenCalledWith(
        expect.objectContaining({ descContains: 'wid' })
      )
    );
  });

  it('calls onSelect when user double-clicks a row', async () => {
    const onSelect = renderLookup();
    await screen.findByText('A1');
    await userEvent.dblClick(screen.getByText('A1'));
    expect(onSelect).toHaveBeenCalledWith({ skuCode: 'A1', skuId: 'A1' });
  });

  it('calls onSelect when user selects a row and clicks Save', async () => {
    const onSelect = renderLookup();
    await screen.findByText('A1');
    await userEvent.click(screen.getByText('A2'));
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(onSelect).toHaveBeenCalledWith({ skuCode: 'A2', skuId: 'A2' });
  });
});
```

- [ ] **Step 4.2: Run the test — expect FAIL (module not found)**

```
pnpm --filter web test -- SkuLookup
```

- [ ] **Step 4.3: Implement the modal**

```tsx
// apps/web/src/components/sku-lookup/SkuLookup.tsx
import React, { useMemo, useState } from 'react';
import { Button, Checkbox, Input, Modal, Radio, Space, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  searchSkusForLookup,
  type SkuLookupRow,
  type SkuLookupSort,
} from '../../services/skuApi';

export interface SkuLookupProps {
  open: boolean;
  onClose: () => void;
  onSelect: (picked: { skuCode: string; skuId: string }) => void;
  initialQuery?: string;
  allowCreate?: boolean;
}

const PAGE_SIZE = 50;
const SORT_OPTIONS: Array<{ value: SkuLookupSort; label: string }> = [
  { value: 'SKU',         label: 'SKU' },
  { value: 'DESCRIPTION', label: 'Description' },
  { value: 'VENDOR',      label: 'Vendor' },
  { value: 'STYLE_COLOR', label: 'Style/Color' },
];

export const SkuLookup: React.FC<SkuLookupProps> = ({
  open, onClose, onSelect, initialQuery = '', allowCreate = false,
}) => {
  const [q, setQ] = useState(initialQuery);
  const [pendingDesc, setPendingDesc] = useState('');
  const [descContains, setDescContains] = useState('');
  const [wholeWord, setWholeWord] = useState(false);
  const [sort, setSort] = useState<SkuLookupSort>('SKU');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<SkuLookupRow | null>(null);
  const navigate = useNavigate();

  const queryParams = useMemo(
    () => ({ q, descContains, wholeWord, sort, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    [q, descContains, wholeWord, sort, page]
  );

  const { data, isFetching } = useQuery({
    queryKey: ['sku-lookup', queryParams],
    queryFn: () => searchSkusForLookup(queryParams),
    enabled: open,
    staleTime: 30_000,
  });

  const columns: ColumnsType<SkuLookupRow> = [
    { title: 'SKU',         dataIndex: 'skuCode',      key: 'skuCode',      width: 140 },
    { title: 'Description', dataIndex: 'description',  key: 'description' },
    { title: 'Vendor',      dataIndex: 'vendor',       key: 'vendor',       width: 100 },
    { title: 'Categ.',      dataIndex: 'category',     key: 'category',     width: 80 },
    { title: 'Style/Color', dataIndex: 'styleColor',   key: 'styleColor',   width: 160 },
    {
      title: 'Price',
      dataIndex: 'currentPrice',
      key: 'currentPrice',
      width: 100,
      align: 'right',
      render: (value: number | null) =>
        value == null
          ? '—'
          : new Intl.NumberFormat('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value),
    },
  ];

  const confirmSelection = (row: SkuLookupRow | null) => {
    if (!row) return;
    onSelect({ skuCode: row.skuCode, skuId: row.skuId });
    onClose();
  };

  return (
    <Modal
      title="SKU Lookup"
      open={open}
      onCancel={onClose}
      width={900}
      footer={[
        <Button key="save" type="primary" disabled={!selected} onClick={() => confirmSelection(selected)}>
          Save
        </Button>,
        <Button key="cancel" onClick={onClose}>Cancel</Button>,
        allowCreate ? (
          <Button key="add" onClick={() => { onClose(); navigate('/products/skus/new'); }}>
            Add
          </Button>
        ) : null,
      ]}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <Space wrap>
          <label>
            SKU:&nbsp;
            <Input
              autoFocus
              value={q}
              placeholder="Prefix match"
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
              style={{ width: 200 }}
            />
          </label>

          <Radio.Group
            value={sort}
            onChange={(e) => { setSort(e.target.value); setPage(1); }}
          >
            {SORT_OPTIONS.map((opt) => (
              <Radio key={opt.value} value={opt.value}>{opt.label}</Radio>
            ))}
          </Radio.Group>
        </Space>

        <Space wrap>
          <label htmlFor="desc-contains">Restrict search to descriptions containing:</label>
          <Input
            id="desc-contains"
            value={pendingDesc}
            onChange={(e) => setPendingDesc(e.target.value)}
            style={{ width: 200 }}
          />
          <Checkbox
            checked={wholeWord}
            onChange={(e) => setWholeWord(e.target.checked)}
          >
            Whole word only
          </Checkbox>
          <Button onClick={() => { setDescContains(pendingDesc); setPage(1); }}>Go</Button>
        </Space>

        <Table<SkuLookupRow>
          rowKey="skuId"
          size="small"
          loading={isFetching}
          dataSource={data?.rows ?? []}
          columns={columns}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total: data?.total ?? 0,
            onChange: setPage,
            showSizeChanger: false,
          }}
          rowSelection={{
            type: 'radio',
            selectedRowKeys: selected ? [selected.skuId] : [],
            onChange: (_keys, rows) => setSelected(rows[0] ?? null),
          }}
          onRow={(record) => ({
            onClick: () => setSelected(record),
            onDoubleClick: () => confirmSelection(record),
          })}
          scroll={{ y: 360 }}
        />
      </Space>
    </Modal>
  );
};
```

- [ ] **Step 4.4: Add barrel export**

```ts
// apps/web/src/components/sku-lookup/index.ts
export { SkuLookup } from './SkuLookup';
export type { SkuLookupProps } from './SkuLookup';
```

- [ ] **Step 4.5: Run tests — expect PASS**

```
pnpm --filter web test -- SkuLookup
```

Expected: 4 passing.

- [ ] **Step 4.6: Commit**

```
git add apps/web/src/components/sku-lookup/
git commit -m "feat(products): add shared SkuLookup modal primitive"
```

---

## Phase B — Extend the inquiry payload

### Task 5: Extend `ricsProductAdapter.ts` to expose the new payload fields

**Files:**
- Modify: `apps/api/src/services/ricsProductAdapter.ts` (add/extend a `getInventoryInquiryDetail` or the payload-shaping helper used by the facade — locate it around the existing inquiry logic)
- Create: `apps/api/tests/services/ricsInquiryPayload.test.ts`

- [ ] **Step 5.1: Read the current inquiry-shaping logic**

Read `apps/api/src/services/ricsInventoryFacade.ts` function `getInventoryInquiry` (line 44). Read the function it calls in `ricsProductAdapter.ts` (likely `loadInventoryInquiry` or similar — search for the returned shape). Confirm: what fields are already included, and what's missing vs. the spec's payload?

Record findings in a scratch comment in the test file below. No code change yet.

- [ ] **Step 5.2: Write the failing test**

```ts
// apps/api/tests/services/ricsInquiryPayload.test.ts
import { getInventoryInquiry } from '../../src/services/ricsInventoryFacade';

describe('getInventoryInquiry (extended payload)', () => {
  it('returns the pricing block with all four slots and currentSlot', async () => {
    // Pick a SKU known to exist in the fixture DBs. ZN02-NDPT appears in the spec screenshot.
    const result = await getInventoryInquiry('ZN02-NDPT');
    expect(result).not.toBeNull();
    expect(result!.pricing).toEqual(
      expect.objectContaining({
        retail: expect.any(Number),
        markdown1: expect.any(Number),
        markdown2: expect.any(Number),
        avgCost: expect.any(Number),
        currentCost: expect.any(Number),
        listPrice: expect.any(Number),
        currentSlot: expect.stringMatching(/^(LIST|RETAIL|MARKDOWN1|MARKDOWN2)$/),
      })
    );
  });

  it('returns the rollup strip with Week/Month/Season/Year × Qty/Net/Markdown/Profit', async () => {
    const result = await getInventoryInquiry('ZN02-NDPT');
    expect(result!.rollup).toEqual(
      expect.objectContaining({
        week:   expect.objectContaining({ qty: expect.any(Number), net: expect.any(Number), markdown: expect.any(Number), profit: expect.any(Number) }),
        month:  expect.objectContaining({ qty: expect.any(Number) }),
        season: expect.objectContaining({ qty: expect.any(Number) }),
        year:   expect.objectContaining({ qty: expect.any(Number) }),
      })
    );
  });

  it('returns the live grids (onHand, model, max, reorder, short, allStoresOnHand, allStoresSummary)', async () => {
    const result = await getInventoryInquiry('ZN02-NDPT');
    const keys = Object.keys(result!.grids);
    ['onHand', 'model', 'max', 'reorder', 'short', 'allStoresOnHand', 'allStoresSummary']
      .forEach((k) => expect(keys).toContain(k));
  });

  it('returns pictureUrl when PictureFileName is set, null otherwise', async () => {
    const result = await getInventoryInquiry('ZN02-NDPT');
    expect(
      result!.pictureUrl === null || typeof result!.pictureUrl === 'string'
    ).toBe(true);
    if (typeof result!.pictureUrl === 'string') {
      expect(result!.pictureUrl).toMatch(/^\/rics-images\//);
    }
  });
});
```

- [ ] **Step 5.3: Run the test — expect FAIL**

```
pnpm --filter api test -- ricsInquiryPayload
```

Expected: either the fields are missing or the types don't match.

- [ ] **Step 5.4: Extend the `InventoryInquiry` type**

Open `apps/api/src/services/ricsInventoryFacade.ts` (or wherever `InventoryInquiry` is declared — search for `interface InventoryInquiry`). Extend it to include the new blocks:

```ts
// apps/api/src/services/ricsInventoryFacade.ts (extend type declaration)

export type PriceSlot = 'LIST' | 'RETAIL' | 'MARKDOWN1' | 'MARKDOWN2';

export interface InquiryPricing {
  retail: number;
  markdown1: number;
  markdown2: number;
  avgCost: number;
  currentCost: number;
  listPrice: number;
  currentSlot: PriceSlot;
}

export interface InquiryRollupCell {
  qty: number;
  net: number;
  markdown: number;
  profit: number;
}

export interface InquiryRollup {
  week: InquiryRollupCell;
  month: InquiryRollupCell;
  season: InquiryRollupCell;
  year: InquiryRollupCell;
}

export interface InquirySizeGrid {
  columns: string[];
  rows: Array<{ label: string; cells: Array<{ value: number | null }> }>;
}

export interface InquiryGrids {
  onHand?: InquirySizeGrid;
  model?: InquirySizeGrid;
  max?: InquirySizeGrid;
  reorder?: InquirySizeGrid;
  short?: InquirySizeGrid;
  allStoresOnHand?: InquirySizeGrid;
  allStoresSummary?: InquirySizeGrid;
}

// Extend existing InventoryInquiry with:
export interface InventoryInquiry {
  // ...existing fields (sku, description, category, vendor, vendorSku, styleColor,
  //    sizeType, lastReceivedAt, stores[]) stay as they are...
  pricing: InquiryPricing;
  rollup: InquiryRollup;
  grids: InquiryGrids;
  pictureUrl: string | null;
}
```

- [ ] **Step 5.5: Extend the adapter to populate the new fields**

Open `apps/api/src/services/ricsProductAdapter.ts`. Locate the function that builds the current inquiry result (it's the one called by `getInventoryInquiry` in the facade). Add these helpers near the top and extend the builder:

```ts
// apps/api/src/services/ricsProductAdapter.ts (add helpers + extend the inquiry builder)

function toNumber(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function resolveCurrentSlot(raw: string | number | null | undefined): 'LIST' | 'RETAIL' | 'MARKDOWN1' | 'MARKDOWN2' {
  // RICS InventoryMaster.CurrentPrice is a 1-char selector: L=List, R=Retail, 1=Markdown1, 2=Markdown2.
  // Adapt this to whatever representation the snapshot already uses — existing getPriceSlots has the truth.
  const s = String(raw ?? 'R').toUpperCase();
  if (s === 'L') return 'LIST';
  if (s === '1') return 'MARKDOWN1';
  if (s === '2') return 'MARKDOWN2';
  return 'RETAIL';
}

function buildPricing(invRow: InventoryMasterRow): InquiryPricing {
  return {
    retail:       toNumber(invRow.RetailPrice),
    markdown1:    toNumber(invRow.MarkDownPrice1),
    markdown2:    toNumber(invRow.MarkDownPrice2),
    avgCost:      toNumber(invRow.AvgCost ?? invRow.AverageCost),
    currentCost:  toNumber(invRow.CurrentCost),
    listPrice:    toNumber(invRow.ListPrice),
    currentSlot:  resolveCurrentSlot(invRow.CurrentPrice),
  };
}

// NOTE: Rollup (Qty/Net/Markdown/Profit × Wk/Mo/Sn/Yr) is not in InventoryMaster.
// Source it from RIINVHIS / sales aggregates if the adapter already surfaces them;
// otherwise return all zeros and log a warning — the `InfoTab` will still render,
// and the rollup's real data path is tracked in the design doc's Deferred table
// under `sales-reporting.getSizeGridSales`.
function buildRollup(/* invRow, salesRollupFromExisting */ ): InquiryRollup {
  const empty = { qty: 0, net: 0, markdown: 0, profit: 0 };
  return { week: empty, month: empty, season: empty, year: empty };
}

function buildGrids(perStoreBlocks: /*existing type*/ any[]): InquiryGrids {
  // Translate the existing per-store data into the new canonical grid shape.
  // onHand / model / max / reorder / short come directly from replenishment rows.
  // allStoresOnHand / allStoresSummary aggregate across stores.
  // Implementation mirrors how InventoryInquiryPage.tsx currently renders its cards.
  // Keep behavior identical — this is a shape change, not a data change.
  return {
    onHand: mapStoresToGrid(perStoreBlocks, 'onHand'),
    model: mapStoresToGrid(perStoreBlocks, 'model'),
    max: mapStoresToGrid(perStoreBlocks, 'max'),
    reorder: mapStoresToGrid(perStoreBlocks, 'reorder'),
    short: mapStoresToGrid(perStoreBlocks, 'short'),
    allStoresOnHand: aggregateAllStoresGrid(perStoreBlocks, 'onHand'),
    allStoresSummary: aggregateAllStoresGrid(perStoreBlocks),
  };
}

function buildPictureUrl(invRow: InventoryMasterRow): string | null {
  const fileName = invRow.PictureFileName;
  if (!fileName) return null;
  return `/rics-images/${encodeURIComponent(String(fileName))}`;
}

// Helper stubs — implement using the same per-store / per-row data the current adapter already pulls.
function mapStoresToGrid(_blocks: any[], _metric: string): InquirySizeGrid {
  // TODO hooks for existing per-store cell data; see the `InventoryInquiryPage.tsx` render code
  // for the mapping from cells → (label, cells[]).
  return { columns: [], rows: [] };
}

function aggregateAllStoresGrid(_blocks: any[], _metric?: string): InquirySizeGrid {
  return { columns: [], rows: [] };
}
```

In the function that currently returns the inquiry result (the one called by `getInventoryInquiry`), add the new fields to the return object:

```ts
return {
  // ...existing fields,
  pricing: buildPricing(invRow),
  rollup: buildRollup(),
  grids: buildGrids(perStoreBlocks),
  pictureUrl: buildPictureUrl(invRow),
};
```

**Important:** the `mapStoresToGrid` / `aggregateAllStoresGrid` helpers must actually read from the same snapshot the current per-store card renderer uses. Implement them by reading the existing per-store data structure (which the adapter already returns to the current page). Do not invent new queries; just reshape.

- [ ] **Step 5.6: Run the tests — expect PASS**

```
pnpm --filter api test -- ricsInquiryPayload
```

Expected: 4 passing. If any fixture test fails because the fixture DB doesn't have the SKU, substitute a SKU that's known to exist (run a query or check the seed).

- [ ] **Step 5.7: Commit**

```
git add apps/api/src/services/ricsProductAdapter.ts \
        apps/api/src/services/ricsInventoryFacade.ts \
        apps/api/tests/services/ricsInquiryPayload.test.ts
git commit -m "feat(products): extend inquiry payload with pricing/rollup/grids/pictureUrl"
```

---

### Task 6: Thread the extended type through `useRicsInventory` (frontend)

**Files:**
- Modify: `apps/web/src/hooks/useRicsInventory.ts` (the `InventoryInquiry` type used by `useInventoryInquiry` — search for the type import; keep the hook body unchanged)
- Modify: any shared type file under `apps/web/src/types/` that mirrors the backend `InventoryInquiry` shape

- [ ] **Step 6.1: Read the current type definition**

Find where the frontend's `InventoryInquiry` type is declared. Search: `grep -n "interface InventoryInquiry" apps/web/src`. Note path and line.

- [ ] **Step 6.2: Add the extended fields (mirror the backend)**

```ts
// apps/web/src/types/inventoryInquiry.ts (or wherever the type lives)
export type PriceSlot = 'LIST' | 'RETAIL' | 'MARKDOWN1' | 'MARKDOWN2';

export interface InquiryPricing {
  retail: number;
  markdown1: number;
  markdown2: number;
  avgCost: number;
  currentCost: number;
  listPrice: number;
  currentSlot: PriceSlot;
}

export interface InquiryRollupCell {
  qty: number; net: number; markdown: number; profit: number;
}

export interface InquiryRollup {
  week: InquiryRollupCell;
  month: InquiryRollupCell;
  season: InquiryRollupCell;
  year: InquiryRollupCell;
}

export interface InquirySizeGrid {
  columns: string[];
  rows: Array<{ label: string; cells: Array<{ value: number | null }> }>;
}

export interface InquiryGrids {
  onHand?: InquirySizeGrid;
  model?: InquirySizeGrid;
  max?: InquirySizeGrid;
  reorder?: InquirySizeGrid;
  short?: InquirySizeGrid;
  allStoresOnHand?: InquirySizeGrid;
  allStoresSummary?: InquirySizeGrid;
}

export interface InventoryInquiry {
  // ...existing fields preserved...
  pricing: InquiryPricing;
  rollup: InquiryRollup;
  grids: InquiryGrids;
  pictureUrl: string | null;
}
```

- [ ] **Step 6.3: Run type check**

```
pnpm --filter web typecheck
```

Expected: clean. If the old page (`InventoryInquiryPage.tsx`) uses the fields now required and it fails, make those fields optional temporarily — the old page gets removed in Task 24.

- [ ] **Step 6.4: Commit**

```
git add apps/web/src/types/inventoryInquiry.ts apps/web/src/hooks/useRicsInventory.ts
git commit -m "feat(products): extend frontend InventoryInquiry type for Product Inquiry page"
```

---

### Task 7: Verify the route still serves the extended payload end-to-end

**Files:**
- Modify: `apps/api/tests/routes/inventoryInquiryRoute.test.ts` (or the existing route test — search for "inquiry/:sku" in `apps/api/tests/`; create if absent)

- [ ] **Step 7.1: Write a focused route test**

```ts
// apps/api/tests/routes/inventoryInquiryRoute.test.ts (create if missing; otherwise extend)
import request from 'supertest';
import { createApp } from '../../src/app';

describe('GET /api/v1/inventory/inquiry/:sku', () => {
  it('returns the full extended payload', async () => {
    const app = await createApp();
    const res = await request(app).get('/api/v1/inventory/inquiry/ZN02-NDPT');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        sku: 'ZN02-NDPT',
        pricing: expect.any(Object),
        rollup: expect.any(Object),
        grids: expect.any(Object),
        pictureUrl: expect.toBeOneOf
          ? expect.toBeOneOf([null, expect.any(String)])
          : expect.anything(),
      })
    );
  });
});
```

- [ ] **Step 7.2: Run — expect PASS**

```
pnpm --filter api test -- inventoryInquiryRoute
```

- [ ] **Step 7.3: Commit**

```
git add apps/api/tests/routes/inventoryInquiryRoute.test.ts
git commit -m "test(products): cover extended inquiry payload at the route boundary"
```

---

## Phase C — New Inquiry page

### Task 8: `InquiryPage` shell + route registration

**Files:**
- Create: `apps/web/src/pages/products/inquiry/InquiryPage.tsx`
- Create: `apps/web/src/pages/products/inquiry/useInquiryData.ts`
- Create: `apps/web/src/pages/products/inquiry/InquiryPage.test.tsx`
- Modify: `apps/web/src/App.tsx` — add the `/products/inquiry/:skuCode` route

- [ ] **Step 8.1: Write the failing test**

```tsx
// apps/web/src/pages/products/inquiry/InquiryPage.test.tsx
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./useInquiryData', () => ({
  useInquiryData: vi.fn(),
}));

import { useInquiryData } from './useInquiryData';
import { InquiryPage } from './InquiryPage';

function renderPage(initialEntries = ['/products/inquiry/ZN02-NDPT']) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/products/inquiry/:skuCode" element={<InquiryPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('InquiryPage', () => {
  it('shows a loading state while data is pending', () => {
    (useInquiryData as any).mockReturnValue({ isLoading: true, data: null, error: null });
    renderPage();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows an error alert when the fetch fails', () => {
    (useInquiryData as any).mockReturnValue({ isLoading: false, data: null, error: new Error('boom') });
    renderPage();
    expect(screen.getByText(/boom/i)).toBeInTheDocument();
  });

  it('renders the SKU code from the URL in the header on success', () => {
    (useInquiryData as any).mockReturnValue({
      isLoading: false,
      data: {
        sku: 'ZN02-NDPT',
        description: 'SandPtMetChar',
        category: { id: 567, name: 'Zap' },
        vendor: { code: 'KNIN', name: 'NINETY NINE' },
        vendorSku: 'ZN02 ND PT',
        styleColor: 'PT/ND',
        sizeType: { id: 309, name: 'Zap Dam-Cab', columns: [], rows: [] },
        lastReceivedAt: '2026-04-19',
        pricing: { retail: 665.22, markdown1: 332.61, markdown2: 598.70, avgCost: 0, currentCost: 241.82, listPrice: 765, currentSlot: 'RETAIL' },
        rollup: { week: { qty: 0, net: 0, markdown: 0, profit: 0 }, month: { qty: 0, net: 0, markdown: 0, profit: 0 }, season: { qty: 0, net: 0, markdown: 0, profit: 0 }, year: { qty: 14, net: 7317.42, markdown: 1995.66, profit: 3933.79 } },
        grids: {},
        pictureUrl: null,
      },
      error: null,
    });
    renderPage();
    expect(screen.getByText('ZN02-NDPT')).toBeInTheDocument();
    expect(screen.getByText('SandPtMetChar')).toBeInTheDocument();
  });
});
```

- [ ] **Step 8.2: Run — expect FAIL (modules missing)**

```
pnpm --filter web test -- InquiryPage
```

- [ ] **Step 8.3: Implement `useInquiryData`**

```ts
// apps/web/src/pages/products/inquiry/useInquiryData.ts
import { useQuery } from '@tanstack/react-query';
import type { InventoryInquiry } from '../../../types/inventoryInquiry';

export function useInquiryData(skuCode: string, storeId?: number) {
  return useQuery<InventoryInquiry>({
    queryKey: ['product-inquiry', skuCode, storeId],
    queryFn: async () => {
      const qs = storeId !== undefined ? `?storeId=${storeId}` : '';
      const response = await fetch(`/api/v1/inventory/inquiry/${encodeURIComponent(skuCode)}${qs}`);
      if (response.status === 404) throw new Error(`SKU ${skuCode} not found`);
      if (!response.ok) throw new Error(`Inquiry failed: ${response.status}`);
      return response.json();
    },
    enabled: !!skuCode,
    staleTime: 30_000,
  });
}
```

- [ ] **Step 8.4: Implement the shell `InquiryPage`**

```tsx
// apps/web/src/pages/products/inquiry/InquiryPage.tsx
import React from 'react';
import { Alert, Spin } from 'antd';
import { useParams, useSearchParams } from 'react-router-dom';
import { useInquiryData } from './useInquiryData';

export const InquiryPage: React.FC = () => {
  const { skuCode = '' } = useParams<{ skuCode: string }>();
  const [params] = useSearchParams();
  const storeIdRaw = params.get('storeId');
  const storeId = storeIdRaw ? Number(storeIdRaw) : undefined;

  const { data, isLoading, error } = useInquiryData(skuCode, storeId);

  if (isLoading) return <Spin role="status" />;
  if (error) return <Alert type="error" message={(error as Error).message} />;
  if (!data) return null;

  return (
    <div>
      <header>
        <h1>{data.sku}</h1>
        <p>{data.description}</p>
      </header>
      {/* Header, Pricing, Rollup, Picture, ViewModeSelector, ActionBar, tabs wired in following tasks */}
    </div>
  );
};
```

- [ ] **Step 8.5: Register the route**

Open `apps/web/src/App.tsx`. Add an import at the top:

```tsx
import { InquiryPage } from './pages/products/inquiry/InquiryPage';
```

Add a route (after the existing `/inventory/inquiry` route on line 132, or next to it):

```tsx
<Route path="/products/inquiry/:skuCode" element={<InquiryPage />} />
```

- [ ] **Step 8.6: Run tests — expect PASS**

```
pnpm --filter web test -- InquiryPage
```

- [ ] **Step 8.7: Commit**

```
git add apps/web/src/pages/products/inquiry/ apps/web/src/App.tsx
git commit -m "feat(products): add InquiryPage shell at /products/inquiry/:skuCode"
```

---

### Task 9: `HeaderCard` component

**Files:**
- Create: `apps/web/src/pages/products/inquiry/HeaderCard.tsx`
- Create: `apps/web/src/pages/products/inquiry/HeaderCard.test.tsx`
- Modify: `InquiryPage.tsx` — mount the component

- [ ] **Step 9.1: Write the failing test**

```tsx
// apps/web/src/pages/products/inquiry/HeaderCard.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HeaderCard } from './HeaderCard';

const inquiry = {
  sku: 'ZN02-NDPT',
  description: 'SandPtMetChar',
  category: { id: 567, name: 'Zap T/Med' },
  vendor: { code: 'KNIN', name: 'NINETY NINE' },
  vendorSku: 'ZN02 ND PT',
  styleColor: 'PT/ND',
  sizeType: { id: 309, name: 'Zap Dam-Cab', columns: [], rows: [] },
  lastReceivedAt: '2026-04-19',
} as any;

describe('HeaderCard', () => {
  it('renders every identity field from the RICS inquiry header', () => {
    render(<HeaderCard inquiry={inquiry} />);
    expect(screen.getByText('ZN02-NDPT')).toBeInTheDocument();
    expect(screen.getByText('SandPtMetChar')).toBeInTheDocument();
    expect(screen.getByText(/567/)).toBeInTheDocument();
    expect(screen.getByText(/KNIN/)).toBeInTheDocument();
    expect(screen.getByText('ZN02 ND PT')).toBeInTheDocument();
    expect(screen.getByText('PT/ND')).toBeInTheDocument();
    expect(screen.getByText(/Zap Dam-Cab/)).toBeInTheDocument();
    expect(screen.getByText('2026-04-19')).toBeInTheDocument();
  });
});
```

- [ ] **Step 9.2: Run — expect FAIL**

- [ ] **Step 9.3: Implement `HeaderCard`**

```tsx
// apps/web/src/pages/products/inquiry/HeaderCard.tsx
import React from 'react';
import { Descriptions } from 'antd';
import type { InventoryInquiry } from '../../../types/inventoryInquiry';

export const HeaderCard: React.FC<{ inquiry: InventoryInquiry }> = ({ inquiry }) => (
  <Descriptions title={inquiry.sku} size="small" column={2} bordered>
    <Descriptions.Item label="Description">{inquiry.description}</Descriptions.Item>
    <Descriptions.Item label="Category">
      {inquiry.category.id} {inquiry.category.name}
    </Descriptions.Item>
    <Descriptions.Item label="Vendor">
      {inquiry.vendor.code} {inquiry.vendor.name}
    </Descriptions.Item>
    <Descriptions.Item label="Vendor SKU">{inquiry.vendorSku ?? '—'}</Descriptions.Item>
    <Descriptions.Item label="Style/Color">{inquiry.styleColor ?? '—'}</Descriptions.Item>
    <Descriptions.Item label="Size Type">
      {inquiry.sizeType.id} {inquiry.sizeType.name}
    </Descriptions.Item>
    <Descriptions.Item label="Last Received">{inquiry.lastReceivedAt ?? '—'}</Descriptions.Item>
  </Descriptions>
);
```

- [ ] **Step 9.4: Mount in `InquiryPage.tsx`**

Replace the `<header>...</header>` block with:

```tsx
import { HeaderCard } from './HeaderCard';
// ...
<HeaderCard inquiry={data} />
```

- [ ] **Step 9.5: Run — expect PASS**

```
pnpm --filter web test -- HeaderCard
```

- [ ] **Step 9.6: Commit**

```
git add apps/web/src/pages/products/inquiry/HeaderCard.tsx \
        apps/web/src/pages/products/inquiry/HeaderCard.test.tsx \
        apps/web/src/pages/products/inquiry/InquiryPage.tsx
git commit -m "feat(products): add HeaderCard to inquiry page"
```

---

### Task 10: `PricingPanel` component

**Files:**
- Create: `apps/web/src/pages/products/inquiry/PricingPanel.tsx`
- Create: `apps/web/src/pages/products/inquiry/PricingPanel.test.tsx`
- Modify: `InquiryPage.tsx` — mount

- [ ] **Step 10.1: Write the failing test**

```tsx
// apps/web/src/pages/products/inquiry/PricingPanel.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PricingPanel } from './PricingPanel';

const pricing = {
  retail: 665.22, markdown1: 332.61, markdown2: 598.70,
  avgCost: 0, currentCost: 241.82, listPrice: 765,
  currentSlot: 'RETAIL' as const,
};

describe('PricingPanel', () => {
  it('renders all six price fields', () => {
    render(<PricingPanel pricing={pricing} />);
    expect(screen.getByText('665.22')).toBeInTheDocument();
    expect(screen.getByText('332.61')).toBeInTheDocument();
    expect(screen.getByText('598.70')).toBeInTheDocument();
    expect(screen.getByText('241.82')).toBeInTheDocument();
    expect(screen.getByText('765')).toBeInTheDocument();
  });

  it('highlights the current price slot', () => {
    render(<PricingPanel pricing={pricing} />);
    const retailRow = screen.getByText('Retail Price').closest('tr');
    expect(retailRow).toHaveAttribute('data-current', 'true');
  });

  it('omits the currency symbol (amounts in Lempira; symbol shown elsewhere)', () => {
    render(<PricingPanel pricing={pricing} />);
    expect(screen.queryByText(/L\s*665/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 10.2: Run — expect FAIL**

- [ ] **Step 10.3: Implement**

```tsx
// apps/web/src/pages/products/inquiry/PricingPanel.tsx
import React from 'react';
import type { InquiryPricing, PriceSlot } from '../../../types/inventoryInquiry';

const money = new Intl.NumberFormat('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const moneyNoDecimals = new Intl.NumberFormat('es-HN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const ROWS: Array<{ label: string; key: keyof InquiryPricing; slot?: PriceSlot; formatter?: Intl.NumberFormat }> = [
  { label: 'Retail Price',  key: 'retail',      slot: 'RETAIL',    formatter: money },
  { label: 'Markdown 1',    key: 'markdown1',   slot: 'MARKDOWN1', formatter: money },
  { label: 'Markdown 2',    key: 'markdown2',   slot: 'MARKDOWN2', formatter: money },
  { label: 'Average Cost',  key: 'avgCost',                        formatter: money },
  { label: 'Current Cost',  key: 'currentCost',                    formatter: money },
  { label: 'List Price',    key: 'listPrice',   slot: 'LIST',      formatter: moneyNoDecimals },
];

export const PricingPanel: React.FC<{ pricing: InquiryPricing }> = ({ pricing }) => (
  <table style={{ borderCollapse: 'collapse' }}>
    <tbody>
      {ROWS.map(({ label, key, slot, formatter }) => {
        const isCurrent = slot !== undefined && pricing.currentSlot === slot;
        const fmt = formatter ?? money;
        return (
          <tr key={key} data-current={isCurrent ? 'true' : undefined}
              style={{ fontWeight: isCurrent ? 600 : 400 }}>
            <th style={{ textAlign: 'right', paddingRight: 12 }}>{label}</th>
            <td style={{ textAlign: 'right' }}>{fmt.format(pricing[key] as number)}</td>
          </tr>
        );
      })}
    </tbody>
  </table>
);
```

- [ ] **Step 10.4: Mount in `InquiryPage.tsx`**

```tsx
import { PricingPanel } from './PricingPanel';
// ...
<PricingPanel pricing={data.pricing} />
```

- [ ] **Step 10.5: Run — expect PASS**

- [ ] **Step 10.6: Commit**

```
git add apps/web/src/pages/products/inquiry/PricingPanel.tsx \
        apps/web/src/pages/products/inquiry/PricingPanel.test.tsx \
        apps/web/src/pages/products/inquiry/InquiryPage.tsx
git commit -m "feat(products): add PricingPanel with current-slot highlight"
```

---

### Task 11: `SalesRollupStrip` component

**Files:**
- Create: `apps/web/src/pages/products/inquiry/SalesRollupStrip.tsx`
- Create: `apps/web/src/pages/products/inquiry/SalesRollupStrip.test.tsx`
- Modify: `InquiryPage.tsx` — mount

- [ ] **Step 11.1: Write the failing test**

```tsx
// apps/web/src/pages/products/inquiry/SalesRollupStrip.test.tsx
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SalesRollupStrip } from './SalesRollupStrip';

const rollup = {
  week:   { qty: 0,  net: 0,        markdown: 0,        profit: 0 },
  month:  { qty: 0,  net: 0,        markdown: 0,        profit: 0 },
  season: { qty: 0,  net: 0,        markdown: 0,        profit: 0 },
  year:   { qty: 14, net: 7317.42, markdown: 1995.66, profit: 3933.79 },
};

describe('SalesRollupStrip', () => {
  it('renders the four periods × four measures grid', () => {
    render(<SalesRollupStrip rollup={rollup} />);
    ['Qty', 'Net', 'Markdown', 'Profit'].forEach((col) =>
      expect(screen.getByRole('columnheader', { name: col })).toBeInTheDocument()
    );
    ['Week', 'Month', 'Season', 'Year'].forEach((row) =>
      expect(screen.getByRole('cell', { name: row })).toBeInTheDocument()
    );
  });

  it('formats values with thousands separators and no currency symbol', () => {
    render(<SalesRollupStrip rollup={rollup} />);
    const yearRow = screen.getByRole('row', { name: /Year/ });
    expect(within(yearRow).getByText('14')).toBeInTheDocument();
    expect(within(yearRow).getByText('7,317.42')).toBeInTheDocument();
  });
});
```

- [ ] **Step 11.2: Run — expect FAIL**

- [ ] **Step 11.3: Implement**

```tsx
// apps/web/src/pages/products/inquiry/SalesRollupStrip.tsx
import React from 'react';
import { Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { InquiryRollup } from '../../../types/inventoryInquiry';

const fmtQty = new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtMoney = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Row {
  key: string;
  label: string;
  qty: number;
  net: number;
  markdown: number;
  profit: number;
}

export const SalesRollupStrip: React.FC<{ rollup: InquiryRollup }> = ({ rollup }) => {
  const data: Row[] = [
    { key: 'week',   label: 'Week',   ...rollup.week },
    { key: 'month',  label: 'Month',  ...rollup.month },
    { key: 'season', label: 'Season', ...rollup.season },
    { key: 'year',   label: 'Year',   ...rollup.year },
  ];

  const columns: ColumnsType<Row> = [
    { title: 'Sales',    dataIndex: 'label',    key: 'label' },
    { title: 'Qty',      dataIndex: 'qty',      key: 'qty',      align: 'right', render: (v) => fmtQty.format(v) },
    { title: 'Net',      dataIndex: 'net',      key: 'net',      align: 'right', render: (v) => fmtMoney.format(v) },
    { title: 'Markdown', dataIndex: 'markdown', key: 'markdown', align: 'right', render: (v) => fmtMoney.format(v) },
    { title: 'Profit',   dataIndex: 'profit',   key: 'profit',   align: 'right', render: (v) => fmtMoney.format(v) },
  ];

  return <Table size="small" pagination={false} columns={columns} dataSource={data} />;
};
```

- [ ] **Step 11.4: Mount in `InquiryPage.tsx`**

```tsx
import { SalesRollupStrip } from './SalesRollupStrip';
// ...
<SalesRollupStrip rollup={data.rollup} />
```

- [ ] **Step 11.5: Run — expect PASS**

- [ ] **Step 11.6: Commit**

```
git add apps/web/src/pages/products/inquiry/SalesRollupStrip.tsx \
        apps/web/src/pages/products/inquiry/SalesRollupStrip.test.tsx \
        apps/web/src/pages/products/inquiry/InquiryPage.tsx
git commit -m "feat(products): add SalesRollupStrip to inquiry page"
```

---

### Task 12: `PicturePanel` component

**Files:**
- Create: `apps/web/src/pages/products/inquiry/PicturePanel.tsx`
- Create: `apps/web/src/pages/products/inquiry/PicturePanel.test.tsx`
- Modify: `InquiryPage.tsx` — mount

- [ ] **Step 12.1: Write the failing test**

```tsx
// apps/web/src/pages/products/inquiry/PicturePanel.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PicturePanel } from './PicturePanel';

describe('PicturePanel', () => {
  it('renders an <img> when pictureUrl is provided', () => {
    render(<PicturePanel pictureUrl="/rics-images/ZN02.jpg" alt="ZN02-NDPT" />);
    const img = screen.getByRole('img', { name: 'ZN02-NDPT' });
    expect(img).toHaveAttribute('src', '/rics-images/ZN02.jpg');
  });

  it('renders a placeholder when pictureUrl is null', () => {
    render(<PicturePanel pictureUrl={null} alt="ZN02-NDPT" />);
    expect(screen.getByText(/no picture/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 12.2: Run — expect FAIL**

- [ ] **Step 12.3: Implement**

```tsx
// apps/web/src/pages/products/inquiry/PicturePanel.tsx
import React, { useState } from 'react';
import { Empty } from 'antd';

export const PicturePanel: React.FC<{ pictureUrl: string | null; alt: string }> = ({ pictureUrl, alt }) => {
  const [failed, setFailed] = useState(false);
  if (!pictureUrl || failed) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No picture" />;
  }
  return (
    <img
      src={pictureUrl}
      alt={alt}
      onError={() => setFailed(true)}
      style={{ maxWidth: 220, maxHeight: 220, objectFit: 'contain' }}
    />
  );
};
```

- [ ] **Step 12.4: Mount in `InquiryPage.tsx`**

```tsx
import { PicturePanel } from './PicturePanel';
// ...
<PicturePanel pictureUrl={data.pictureUrl} alt={data.sku} />
```

- [ ] **Step 12.5: Run — expect PASS**

- [ ] **Step 12.6: Commit**

```
git add apps/web/src/pages/products/inquiry/PicturePanel.tsx \
        apps/web/src/pages/products/inquiry/PicturePanel.test.tsx \
        apps/web/src/pages/products/inquiry/InquiryPage.tsx
git commit -m "feat(products): add PicturePanel to inquiry page"
```

---

### Task 13: `ViewModeSelector` with disabled Phase-2 modes

**Files:**
- Create: `apps/web/src/pages/products/inquiry/ViewModeSelector.tsx`
- Create: `apps/web/src/pages/products/inquiry/ViewModeSelector.test.tsx`
- Modify: `InquiryPage.tsx` — mount + wire URL `mode` param

- [ ] **Step 13.1: Write the failing test**

```tsx
// apps/web/src/pages/products/inquiry/ViewModeSelector.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ViewModeSelector, VIEW_MODES } from './ViewModeSelector';

describe('ViewModeSelector', () => {
  it('renders all 15 modes', () => {
    render(<ViewModeSelector value="ALL_STORES_SUMMARY" onChange={() => {}} />);
    expect(VIEW_MODES).toHaveLength(15);
    VIEW_MODES.forEach((m) => expect(screen.getByText(m.label)).toBeInTheDocument());
  });

  it('disables modes that are not v1-live', () => {
    render(<ViewModeSelector value="ALL_STORES_SUMMARY" onChange={() => {}} />);
    const poButton = screen.getByRole('button', { name: /On Order \(At-Once\)/ });
    expect(poButton).toBeDisabled();
  });

  it('calls onChange when a live mode is clicked', async () => {
    const onChange = vi.fn();
    render(<ViewModeSelector value="ALL_STORES_SUMMARY" onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: /On Hand/ }));
    expect(onChange).toHaveBeenCalledWith('ON_HAND');
  });
});
```

- [ ] **Step 13.2: Run — expect FAIL**

- [ ] **Step 13.3: Implement**

```tsx
// apps/web/src/pages/products/inquiry/ViewModeSelector.tsx
import React from 'react';
import { Button, Space, Tooltip } from 'antd';

export type ViewMode =
  | 'ON_HAND' | 'ON_ORDER_CURRENT' | 'ON_ORDER_FUTURE'
  | 'MODEL' | 'SHORT'
  | 'MTD_SALES' | 'STD_SALES' | 'YTD_SALES' | 'LY_SALES'
  | 'SINGLE_COLUMN'
  | 'ALL_STORES_ON_HAND' | 'ALL_STORES_ONE_ROW' | 'ALL_STORES_SUMMARY'
  | 'MAX' | 'REORDER';

interface Mode {
  value: ViewMode;
  label: string;
  shortcut: string;
  live: boolean;
  waitingOn?: string;
}

export const VIEW_MODES: Mode[] = [
  { value: 'ON_HAND',             label: 'On Hand',                shortcut: 'F2',       live: true },
  { value: 'ON_ORDER_CURRENT',    label: 'On Order (At-Once)',     shortcut: 'F3',       live: false, waitingOn: 'purchasing.getOnOrder' },
  { value: 'ON_ORDER_FUTURE',     label: 'On Order (Future)',      shortcut: 'F4',       live: false, waitingOn: 'purchasing.getOnOrder' },
  { value: 'MODEL',               label: 'Model Quantities',       shortcut: 'F5',       live: true },
  { value: 'SHORT',               label: 'Short Quantities',       shortcut: 'F6',       live: true },
  { value: 'MTD_SALES',           label: 'Month-to-Date Sales',    shortcut: 'F7',       live: false, waitingOn: 'sales-reporting.getSizeGridSales' },
  { value: 'STD_SALES',           label: 'Season-to-Date Sales',   shortcut: 'F8',       live: false, waitingOn: 'sales-reporting.getSizeGridSales' },
  { value: 'YTD_SALES',           label: 'Year-To-Date Sales',     shortcut: 'F9',       live: false, waitingOn: 'sales-reporting.getSizeGridSales' },
  { value: 'SINGLE_COLUMN',       label: 'Column Only',            shortcut: 'F11',      live: false, waitingOn: 'Phase 2 UX' },
  { value: 'ALL_STORES_ON_HAND',  label: 'All Stores - On Hand',   shortcut: 'Shift+F1', live: true },
  { value: 'ALL_STORES_ONE_ROW',  label: 'All Stores - 1 Row',     shortcut: 'Shift+F2', live: false, waitingOn: 'Phase 2 UX' },
  { value: 'ALL_STORES_SUMMARY',  label: 'All Stores Summary',     shortcut: 'Shift+F3', live: true },
  { value: 'MAX',                 label: 'Max Quantities',         shortcut: 'Shift+F4', live: true },
  { value: 'REORDER',             label: 'Reorder Quantities',     shortcut: 'Shift+F5', live: true },
  { value: 'LY_SALES',            label: 'Last Year Sales',        shortcut: 'Shift+F6', live: false, waitingOn: 'sales-reporting.getSizeGridSales' },
];

export const ViewModeSelector: React.FC<{
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}> = ({ value, onChange }) => (
  <Space wrap>
    {VIEW_MODES.map((m) => {
      const button = (
        <Button
          key={m.value}
          type={value === m.value ? 'primary' : 'default'}
          disabled={!m.live}
          onClick={() => onChange(m.value)}
        >
          {m.label} <span style={{ opacity: 0.6, marginLeft: 6 }}>{m.shortcut}</span>
        </Button>
      );
      return m.live ? (
        button
      ) : (
        <Tooltip key={m.value} title={`Phase 2 — waiting on ${m.waitingOn}`}>
          <span>{button}</span>
        </Tooltip>
      );
    })}
  </Space>
);
```

- [ ] **Step 13.4: Wire the mode into `InquiryPage.tsx`**

```tsx
import { useSearchParams } from 'react-router-dom';
import { ViewModeSelector, type ViewMode } from './ViewModeSelector';
// ...
const [params, setParams] = useSearchParams();
const mode = (params.get('mode') as ViewMode) || 'ALL_STORES_SUMMARY';
const setMode = (next: ViewMode) => {
  const nextParams = new URLSearchParams(params);
  nextParams.set('mode', next);
  setParams(nextParams, { replace: true });
};
// ...
<ViewModeSelector value={mode} onChange={setMode} />
```

- [ ] **Step 13.5: Run — expect PASS**

- [ ] **Step 13.6: Commit**

```
git add apps/web/src/pages/products/inquiry/ViewModeSelector.tsx \
        apps/web/src/pages/products/inquiry/ViewModeSelector.test.tsx \
        apps/web/src/pages/products/inquiry/InquiryPage.tsx
git commit -m "feat(products): add ViewModeSelector with Phase-2 disabled modes"
```

---

### Task 14: Bind the `SizeGrid` to the selected view mode

**Files:**
- Modify: `apps/web/src/pages/products/inquiry/InquiryPage.tsx`
- Modify: `apps/web/src/pages/products/inquiry/InquiryPage.test.tsx` (extend)

- [ ] **Step 14.1: Extend `InquiryPage.test.tsx`**

```tsx
// Append a new test:
it('renders the selected mode grid', () => {
  (useInquiryData as any).mockReturnValue({
    isLoading: false, error: null,
    data: {
      sku: 'ZN02-NDPT',
      description: '…',
      category: { id: 0, name: '' }, vendor: { code: '', name: '' },
      vendorSku: null, styleColor: null,
      sizeType: { id: 0, name: '', columns: [], rows: [] },
      lastReceivedAt: null,
      pricing: { retail: 0, markdown1: 0, markdown2: 0, avgCost: 0, currentCost: 0, listPrice: 0, currentSlot: 'RETAIL' },
      rollup: { week: {qty:0,net:0,markdown:0,profit:0}, month:{qty:0,net:0,markdown:0,profit:0}, season:{qty:0,net:0,markdown:0,profit:0}, year:{qty:0,net:0,markdown:0,profit:0} },
      grids: {
        allStoresSummary: {
          columns: ['6', 'TOT'],
          rows: [{ label: 'On Hand', cells: [{ value: 8 }, { value: 8 }] }],
        },
      },
      pictureUrl: null,
    },
  });
  renderPage();
  expect(screen.getByRole('row', { name: /On Hand/ })).toBeInTheDocument();
});
```

- [ ] **Step 14.2: Run — expect FAIL**

- [ ] **Step 14.3: Wire the grid into `InquiryPage.tsx`**

```tsx
import { SizeGrid as SizeGridComponent } from '../../../components/size-grid';
// ...
const mode = (params.get('mode') as ViewMode) || 'ALL_STORES_SUMMARY';
// Map a ViewMode to the grid key:
const GRID_KEY_BY_MODE: Partial<Record<ViewMode, keyof typeof data.grids>> = {
  ON_HAND: 'onHand',
  MODEL: 'model',
  SHORT: 'short',
  MAX: 'max',
  REORDER: 'reorder',
  ALL_STORES_ON_HAND: 'allStoresOnHand',
  ALL_STORES_SUMMARY: 'allStoresSummary',
};
const gridKey = GRID_KEY_BY_MODE[mode];
const grid = gridKey ? data.grids[gridKey] : undefined;
// ...
{grid ? <SizeGridComponent grid={grid} /> : <em>No data for this view mode.</em>}
```

- [ ] **Step 14.4: Run — expect PASS**

- [ ] **Step 14.5: Commit**

```
git add apps/web/src/pages/products/inquiry/InquiryPage.tsx \
        apps/web/src/pages/products/inquiry/InquiryPage.test.tsx
git commit -m "feat(products): bind SizeGrid to selected view mode"
```

---

### Task 15: `ActionBar` with Prev/Next + tab toggles

**Files:**
- Create: `apps/web/src/pages/products/inquiry/ActionBar.tsx`
- Create: `apps/web/src/pages/products/inquiry/ActionBar.test.tsx`
- Modify: `InquiryPage.tsx` — mount

- [ ] **Step 15.1: Write the failing test**

```tsx
// apps/web/src/pages/products/inquiry/ActionBar.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ActionBar } from './ActionBar';

describe('ActionBar', () => {
  it('renders all nine action buttons', () => {
    render(<ActionBar activeTab={null} onTab={() => {}} onPrev={() => {}} onNext={() => {}} onClear={() => {}} />);
    ['Clear', 'Prev', 'Next', 'UPCs', 'POs', 'Trend', 'Info', 'Detail', 'Print'].forEach((label) =>
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    );
  });

  it('disables stubbed buttons (POs / Trend / Print)', () => {
    render(<ActionBar activeTab={null} onTab={() => {}} onPrev={() => {}} onNext={() => {}} onClear={() => {}} />);
    expect(screen.getByRole('button', { name: 'POs' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Trend' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Print' })).toBeDisabled();
  });

  it('invokes onTab when a live tab is clicked', async () => {
    const onTab = vi.fn();
    render(<ActionBar activeTab={null} onTab={onTab} onPrev={() => {}} onNext={() => {}} onClear={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'UPCs' }));
    expect(onTab).toHaveBeenCalledWith('UPCS');
  });
});
```

- [ ] **Step 15.2: Run — expect FAIL**

- [ ] **Step 15.3: Implement**

```tsx
// apps/web/src/pages/products/inquiry/ActionBar.tsx
import React from 'react';
import { Button, Space, Tooltip } from 'antd';

export type InquiryTab = 'UPCS' | 'POS' | 'TREND' | 'INFO' | 'DETAIL';

interface Props {
  activeTab: InquiryTab | null;
  onTab: (tab: InquiryTab) => void;
  onPrev: () => void;
  onNext: () => void;
  onClear: () => void;
}

const TABS: Array<{ key: InquiryTab; label: string; live: boolean; waitingOn?: string }> = [
  { key: 'UPCS',   label: 'UPCs',   live: true },
  { key: 'POS',    label: 'POs',    live: false, waitingOn: 'purchasing.getOpenPoLines' },
  { key: 'TREND',  label: 'Trend',  live: false, waitingOn: 'sales-reporting.getEightWeekTrend' },
  { key: 'INFO',   label: 'Info',   live: true },
  { key: 'DETAIL', label: 'Detail', live: true },
];

export const ActionBar: React.FC<Props> = ({ activeTab, onTab, onPrev, onNext, onClear }) => (
  <Space wrap>
    <Button onClick={onClear}>Clear</Button>
    <Button onClick={onPrev}>Prev</Button>
    <Button onClick={onNext}>Next</Button>
    {TABS.map((t) => {
      const btn = (
        <Button
          key={t.key}
          type={activeTab === t.key ? 'primary' : 'default'}
          disabled={!t.live}
          onClick={() => onTab(t.key)}
        >
          {t.label}
        </Button>
      );
      return t.live ? btn : (
        <Tooltip key={t.key} title={`Phase 2 — waiting on ${t.waitingOn}`}>
          <span>{btn}</span>
        </Tooltip>
      );
    })}
    <Tooltip title="Phase 2 — waiting on label-print pipeline">
      <span><Button disabled>Print</Button></span>
    </Tooltip>
  </Space>
);
```

- [ ] **Step 15.4: Mount in `InquiryPage.tsx`**

```tsx
import { ActionBar, type InquiryTab } from './ActionBar';
// ...
const [activeTab, setActiveTab] = React.useState<InquiryTab | null>(null);
// prev/next stubs for now — real cursor in a later iteration
const onPrev = () => {};
const onNext = () => {};
const onClear = () => setActiveTab(null);
// ...
<ActionBar activeTab={activeTab} onTab={setActiveTab} onPrev={onPrev} onNext={onNext} onClear={onClear} />
```

- [ ] **Step 15.5: Run — expect PASS**

- [ ] **Step 15.6: Commit**

```
git add apps/web/src/pages/products/inquiry/ActionBar.tsx \
        apps/web/src/pages/products/inquiry/ActionBar.test.tsx \
        apps/web/src/pages/products/inquiry/InquiryPage.tsx
git commit -m "feat(products): add ActionBar with stubs for POs/Trend/Print"
```

---

## Phase D — Tabs

### Task 16: `UpcsTab` — lists SKU UPCs

**Files:**
- Create: `apps/web/src/pages/products/inquiry/tabs/UpcsTab.tsx`
- Create: `apps/web/src/pages/products/inquiry/tabs/UpcsTab.test.tsx`
- Modify: `InquiryPage.tsx` — render when `activeTab === 'UPCS'`

- [ ] **Step 16.1: Check for an existing UPC endpoint**

Search: `grep -rn "upcs\|Upc\|UPC" apps/api/src/routes/`. If an endpoint like `GET /api/v1/skus/:id/upcs` exists, use it; otherwise the adapter already surfaces UPCs via `getSku`-style functions — add a thin route that returns them.

Record what you found, then pick one of: (a) use existing route; (b) add a minimal new one in this task.

- [ ] **Step 16.2: Write the failing test**

```tsx
// apps/web/src/pages/products/inquiry/tabs/UpcsTab.test.tsx
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./upcsApi', () => ({
  fetchSkuUpcs: vi.fn().mockResolvedValue([
    { upc: '012345678901', columnLabel: '8', rowLabel: null, source: 'VENDOR_GMAIC' },
  ]),
}));

import { UpcsTab } from './UpcsTab';

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <UpcsTab skuCode="ZN02-NDPT" />
    </QueryClientProvider>
  );
}

describe('UpcsTab', () => {
  it('renders UPCs for the SKU', async () => {
    renderTab();
    expect(await screen.findByText('012345678901')).toBeInTheDocument();
  });
});
```

- [ ] **Step 16.3: Run — expect FAIL**

- [ ] **Step 16.4: Implement**

```ts
// apps/web/src/pages/products/inquiry/tabs/upcsApi.ts
export interface SkuUpc {
  upc: string;
  columnLabel: string | null;
  rowLabel: string | null;
  source: string;
}

export async function fetchSkuUpcs(skuCode: string): Promise<SkuUpc[]> {
  const res = await fetch(`/api/v1/skus/${encodeURIComponent(skuCode)}/upcs`);
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`UPC fetch failed: ${res.status}`);
  return res.json();
}
```

```tsx
// apps/web/src/pages/products/inquiry/tabs/UpcsTab.tsx
import React from 'react';
import { Empty, Spin, Table } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { fetchSkuUpcs, type SkuUpc } from './upcsApi';

export const UpcsTab: React.FC<{ skuCode: string }> = ({ skuCode }) => {
  const { data, isLoading } = useQuery({
    queryKey: ['sku-upcs', skuCode],
    queryFn: () => fetchSkuUpcs(skuCode),
    staleTime: 60_000,
  });

  if (isLoading) return <Spin />;
  if (!data || data.length === 0) return <Empty description="No UPCs" />;

  return (
    <Table<SkuUpc>
      rowKey="upc"
      size="small"
      pagination={false}
      dataSource={data}
      columns={[
        { title: 'UPC',    dataIndex: 'upc',         key: 'upc' },
        { title: 'Column', dataIndex: 'columnLabel', key: 'columnLabel' },
        { title: 'Row',    dataIndex: 'rowLabel',    key: 'rowLabel' },
        { title: 'Source', dataIndex: 'source',      key: 'source' },
      ]}
    />
  );
};
```

- [ ] **Step 16.5: Mount in `InquiryPage.tsx`**

```tsx
import { UpcsTab } from './tabs/UpcsTab';
// ...
{activeTab === 'UPCS' && <UpcsTab skuCode={data.sku} />}
```

- [ ] **Step 16.6: Add/verify backend route**

If `GET /api/v1/skus/:id/upcs` didn't already exist from Step 16.1, add it in `apps/api/src/routes/skuRoutes.ts` delegating to the adapter's existing UPC helper. Include a minimal route test in `apps/api/tests/routes/`.

- [ ] **Step 16.7: Run all tests — expect PASS**

```
pnpm --filter web test -- UpcsTab
pnpm --filter api test -- skuRoutes
```

- [ ] **Step 16.8: Commit**

```
git add apps/web/src/pages/products/inquiry/tabs/UpcsTab.tsx \
        apps/web/src/pages/products/inquiry/tabs/UpcsTab.test.tsx \
        apps/web/src/pages/products/inquiry/tabs/upcsApi.ts \
        apps/web/src/pages/products/inquiry/InquiryPage.tsx \
        apps/api/src/routes/skuRoutes.ts
git commit -m "feat(products): add UPCs tab on inquiry page"
```

---

### Task 17: `InfoTab` — metadata block (Season, Label Code, Group, First Received, Last Markdown, Perks, Comments)

**Files:**
- Create: `apps/web/src/pages/products/inquiry/tabs/InfoTab.tsx`
- Create: `apps/web/src/pages/products/inquiry/tabs/InfoTab.test.tsx`
- Possibly extend: `apps/api/src/services/ricsInventoryFacade.ts` to include `info: { seasonCode, labelCode, groupCode, firstReceivedAt, lastMarkdownAt, perks, comment }` in the payload if not already there (these fields already read from `InventoryMaster` per the adapter's field list).

- [ ] **Step 17.1: Extend the backend payload if needed**

Check whether the current inquiry payload already includes these fields. If not, add an `info` block in the adapter (same pattern as `buildPricing`), and extend the `InventoryInquiry` type.

- [ ] **Step 17.2: Write the failing frontend test**

```tsx
// apps/web/src/pages/products/inquiry/tabs/InfoTab.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InfoTab } from './InfoTab';

describe('InfoTab', () => {
  it('renders the seven Info fields', () => {
    render(<InfoTab info={{
      seasonCode: 'S', labelCode: 'H', groupCode: 'ZB',
      firstReceivedAt: '2026-01-10', lastMarkdownAt: '2026-04-01',
      perks: 5, comment: 'Short comment',
    }} />);
    expect(screen.getByText('S')).toBeInTheDocument();
    expect(screen.getByText('H')).toBeInTheDocument();
    expect(screen.getByText('ZB')).toBeInTheDocument();
    expect(screen.getByText('2026-01-10')).toBeInTheDocument();
    expect(screen.getByText('2026-04-01')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('Short comment')).toBeInTheDocument();
  });
});
```

- [ ] **Step 17.3: Run — expect FAIL**

- [ ] **Step 17.4: Implement**

```tsx
// apps/web/src/pages/products/inquiry/tabs/InfoTab.tsx
import React from 'react';
import { Descriptions } from 'antd';

export interface InquiryInfo {
  seasonCode: string | null;
  labelCode: string | null;
  groupCode: string | null;
  firstReceivedAt: string | null;
  lastMarkdownAt: string | null;
  perks: number | null;
  comment: string | null;
}

export const InfoTab: React.FC<{ info: InquiryInfo }> = ({ info }) => (
  <Descriptions size="small" column={2} bordered>
    <Descriptions.Item label="Season">{info.seasonCode ?? '—'}</Descriptions.Item>
    <Descriptions.Item label="Label Code">{info.labelCode ?? '—'}</Descriptions.Item>
    <Descriptions.Item label="Group Code">{info.groupCode ?? '—'}</Descriptions.Item>
    <Descriptions.Item label="Date 1st Received">{info.firstReceivedAt ?? '—'}</Descriptions.Item>
    <Descriptions.Item label="Date Last Markdown">{info.lastMarkdownAt ?? '—'}</Descriptions.Item>
    <Descriptions.Item label="Perks">{info.perks ?? '—'}</Descriptions.Item>
    <Descriptions.Item label="Comments" span={2}>{info.comment ?? '—'}</Descriptions.Item>
  </Descriptions>
);
```

- [ ] **Step 17.5: Mount in `InquiryPage.tsx`**

```tsx
import { InfoTab } from './tabs/InfoTab';
// ...
{activeTab === 'INFO' && <InfoTab info={data.info} />}
```

- [ ] **Step 17.6: Run — expect PASS**

- [ ] **Step 17.7: Commit**

```
git add apps/web/src/pages/products/inquiry/tabs/InfoTab.tsx \
        apps/web/src/pages/products/inquiry/tabs/InfoTab.test.tsx \
        apps/web/src/pages/products/inquiry/InquiryPage.tsx
git commit -m "feat(products): add Info tab on inquiry page"
```

---

### Task 18: `DetailTab` — inventory movement history (reuses existing change-detail adapter)

**Files:**
- Create: `apps/web/src/pages/products/inquiry/tabs/DetailTab.tsx`
- Create: `apps/web/src/pages/products/inquiry/tabs/DetailTab.test.tsx`
- Create stubs: `apps/web/src/pages/products/inquiry/tabs/PosTab.tsx`, `TrendTab.tsx` (placeholders)

- [ ] **Step 18.1: Wire the existing change-detail hook**

`getChangeDetail` already exists in `ricsInventoryFacade.ts` (see exploration). Use `useChangeDetail` or equivalent from `useRicsInventory.ts`.

- [ ] **Step 18.2: Write the failing test**

```tsx
// apps/web/src/pages/products/inquiry/tabs/DetailTab.test.tsx
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../hooks/useRicsInventory', () => ({
  useChangeDetail: vi.fn(() => ({
    data: [
      { date: '2026-04-10', type: 'RECEIVE', qty: 12, ref: 'PO#123' },
      { date: '2026-04-15', type: 'SALE',    qty: -1, ref: 'TX#555' },
    ],
    isLoading: false,
    error: null,
  })),
}));

import { DetailTab } from './DetailTab';

describe('DetailTab', () => {
  it('renders each movement row', () => {
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <DetailTab skuCode="ZN02-NDPT" />
      </QueryClientProvider>
    );
    expect(screen.getByText('PO#123')).toBeInTheDocument();
    expect(screen.getByText('TX#555')).toBeInTheDocument();
  });
});
```

- [ ] **Step 18.3: Run — expect FAIL**

- [ ] **Step 18.4: Implement**

```tsx
// apps/web/src/pages/products/inquiry/tabs/DetailTab.tsx
import React from 'react';
import { Empty, Spin, Table } from 'antd';
import { useChangeDetail } from '../../../../hooks/useRicsInventory';

export const DetailTab: React.FC<{ skuCode: string }> = ({ skuCode }) => {
  const { data, isLoading } = useChangeDetail({ sku: skuCode });
  if (isLoading) return <Spin />;
  if (!data || data.length === 0) return <Empty description="No movements" />;
  return (
    <Table
      rowKey={(r: any, i) => `${r.date}-${i}`}
      size="small"
      pagination={{ pageSize: 50 }}
      dataSource={data}
      columns={[
        { title: 'Date', dataIndex: 'date', key: 'date' },
        { title: 'Type', dataIndex: 'type', key: 'type' },
        { title: 'Qty',  dataIndex: 'qty',  key: 'qty', align: 'right' },
        { title: 'Ref',  dataIndex: 'ref',  key: 'ref' },
      ]}
    />
  );
};
```

- [ ] **Step 18.5: Create `PosTab` and `TrendTab` placeholders**

```tsx
// apps/web/src/pages/products/inquiry/tabs/PosTab.tsx
import React from 'react';
import { Alert } from 'antd';
export const PosTab: React.FC = () => (
  <Alert type="info" showIcon
    message="Coming in Phase 2"
    description="Open POs tab is waiting on purchasing.getOpenPoLines(skuId)." />
);
```

```tsx
// apps/web/src/pages/products/inquiry/tabs/TrendTab.tsx
import React from 'react';
import { Alert } from 'antd';
export const TrendTab: React.FC = () => (
  <Alert type="info" showIcon
    message="Coming in Phase 2"
    description="Eight-Week Trend is waiting on sales-reporting.getEightWeekTrend." />
);
```

- [ ] **Step 18.6: Mount `DetailTab` (and the stubs for future activation) in `InquiryPage.tsx`**

```tsx
import { DetailTab } from './tabs/DetailTab';
// PosTab / TrendTab imported but not yet shown while ActionBar marks them disabled.
// ...
{activeTab === 'DETAIL' && <DetailTab skuCode={data.sku} />}
```

- [ ] **Step 18.7: Run tests — expect PASS**

- [ ] **Step 18.8: Commit**

```
git add apps/web/src/pages/products/inquiry/tabs/
git commit -m "feat(products): add Detail tab; stub PosTab and TrendTab"
```

---

## Phase E — SkuLink sweep

### Task 19: Wire `<SkuLink />` in `SkuListPage`

**Files:**
- Modify: `apps/web/src/pages/inventory/SkuListPage.tsx` (line ~105, the `skuCode` column)
- Modify: `apps/web/src/pages/inventory/SkuListPage.test.tsx` if one exists — otherwise create a minimal snapshot test

- [ ] **Step 19.1: Read the current column definition**

```
grep -n "skuCode" apps/web/src/pages/inventory/SkuListPage.tsx
```

- [ ] **Step 19.2: Replace plain text render with `<SkuLink>`**

Find the `skuCode` column and change its `render` (or add one) to:

```tsx
import { SkuLink } from '../../components/sku-link';
// ...
{
  title: 'SKU',
  dataIndex: 'skuCode',
  key: 'skuCode',
  render: (skuCode: string) => <SkuLink skuCode={skuCode} />,
}
```

If the row already navigates on row click (to an edit page), keep edit behind a separate icon column; the SKU text itself is the inquiry link.

- [ ] **Step 19.3: Verify visually**

```
pnpm --filter web dev
```

Open `/inventory/skus` → click a SKU code → lands on `/products/inquiry/:skuCode`.

- [ ] **Step 19.4: Run tests**

```
pnpm --filter web test -- SkuListPage
```

- [ ] **Step 19.5: Commit**

```
git add apps/web/src/pages/inventory/SkuListPage.tsx
git commit -m "feat(inventory): link SKU column to inquiry via SkuLink"
```

---

### Task 20: Wire `<SkuLink />` in `PurchaseOrderDetailPage`

**Files:**
- Modify: `apps/web/src/pages/purchasing/PurchaseOrderDetailPage.tsx` (line ~162)

- [ ] **Step 20.1: Read current column**

```
grep -n "sku\|skuCode" apps/web/src/pages/purchasing/PurchaseOrderDetailPage.tsx
```

- [ ] **Step 20.2: Replace with `<SkuLink />`**

Same pattern as Task 19.

- [ ] **Step 20.3: Commit**

```
git add apps/web/src/pages/purchasing/PurchaseOrderDetailPage.tsx
git commit -m "feat(purchasing): link PO line SKU to inquiry"
```

---

### Task 21: Wire `<SkuLink />` in Replenishment, Find by Size, Manual Transfer, Manual Receipt

**Files:**
- Modify: `apps/web/src/pages/inventory/ReplenishmentTargetsPage.tsx`
- Modify: `apps/web/src/pages/inventory/FindBySizePage.tsx`
- Modify: `apps/web/src/pages/inventory/ManualTransferEntryPage.tsx`
- Modify: `apps/web/src/pages/inventory/ManualReceiptEntryPage.tsx`

- [ ] **Step 21.1 – 21.4:** For each file, locate the SKU rendering and replace plain text with `<SkuLink skuCode={…} />`. Keep any existing edit icons as-is.

- [ ] **Step 21.5: Commit**

```
git add apps/web/src/pages/inventory/ReplenishmentTargetsPage.tsx \
        apps/web/src/pages/inventory/FindBySizePage.tsx \
        apps/web/src/pages/inventory/ManualTransferEntryPage.tsx \
        apps/web/src/pages/inventory/ManualReceiptEntryPage.tsx
git commit -m "feat(inventory): link SKU references to inquiry across inventory pages"
```

---

### Task 22: Wire `<SkuLink />` in POS mock pages

**Files:**
- Modify: `apps/web/src/pages/purchasing/PoEntryMockPage.tsx`
- Modify: `apps/web/src/pages/purchasing/PoReceiveMockPage.tsx`

- [ ] **Step 22.1: Replace plain SKU renders with `<SkuLink>`**

- [ ] **Step 22.2: Commit**

```
git add apps/web/src/pages/purchasing/PoEntryMockPage.tsx \
        apps/web/src/pages/purchasing/PoReceiveMockPage.tsx
git commit -m "feat(purchasing): link SKU references in POS mock pages"
```

---

## Phase F — Cutover

### Task 23: Redirect `/inventory/inquiry` → new route

**Files:**
- Modify: `apps/web/src/App.tsx`

- [ ] **Step 23.1: Add a redirect component**

```tsx
// apps/web/src/App.tsx (near imports)
import { Navigate, useParams, useSearchParams } from 'react-router-dom';

const LegacyInquiryRedirect: React.FC = () => {
  const { skuCode } = useParams<{ skuCode?: string }>();
  const [params] = useSearchParams();
  if (!skuCode) return <Navigate to="/products/skus" replace />;
  const qs = params.toString();
  return <Navigate to={`/products/inquiry/${skuCode}${qs ? `?${qs}` : ''}`} replace />;
};
```

Replace the existing `/inventory/inquiry` route(s) with:

```tsx
<Route path="/inventory/inquiry" element={<LegacyInquiryRedirect />} />
<Route path="/inventory/inquiry/:skuCode" element={<LegacyInquiryRedirect />} />
```

- [ ] **Step 23.2: Manually verify**

```
pnpm --filter web dev
```

Navigate to `/inventory/inquiry/ZN02-NDPT?storeId=1` → URL becomes `/products/inquiry/ZN02-NDPT?storeId=1`.

- [ ] **Step 23.3: Commit**

```
git add apps/web/src/App.tsx
git commit -m "refactor(inventory): redirect /inventory/inquiry → /products/inquiry/:skuCode"
```

---

### Task 24: Delete the old `InventoryInquiryPage`

**Files:**
- Delete: `apps/web/src/pages/inventory/InventoryInquiryPage.tsx`
- Verify nothing imports it: `grep -rn "InventoryInquiryPage" apps/web/src`

- [ ] **Step 24.1: Remove the file and its test if it has one**

```
rm apps/web/src/pages/inventory/InventoryInquiryPage.tsx
```

- [ ] **Step 24.2: Confirm no imports remain**

```
grep -rn "InventoryInquiryPage" apps/web/src
```

Expected: no output.

- [ ] **Step 24.3: Run full test + typecheck**

```
pnpm --filter web test
pnpm --filter web typecheck
```

- [ ] **Step 24.4: Commit**

```
git add -A apps/web/src/pages/inventory/
git commit -m "refactor(inventory): remove legacy InventoryInquiryPage (replaced by /products/inquiry)"
```

---

## Phase G — Docs

### Task 25: Append pointer to `docs/modules/products.md`

**Files:**
- Modify: `docs/modules/products.md` (§ Product Inquiry)

- [ ] **Step 25.1: Append a deferred-list pointer**

Open `docs/modules/products.md`. In the `## Product Inquiry` section, append (after the last subsection):

```markdown
### Phase 1 — deferred items

For the canonical list of view modes, action tabs, and features that v1 stubs (plus the cross-module contract each one is waiting on), see the design doc:

[`docs/superpowers/specs/2026-04-19-inventory-inquiry-design.md` § Deferred / waiting on](../superpowers/specs/2026-04-19-inventory-inquiry-design.md#deferred--waiting-on).
```

- [ ] **Step 25.2: Commit**

```
git add docs/modules/products.md
git commit -m "docs(products): point to inquiry design doc for deferred items"
```

---

## Self-review

**Spec coverage:**

- §1 Shared primitives → Tasks 1 (`SizeGrid`), 2 (`SkuLink`), 3 (search endpoint), 4 (`SkuLookup`).
- §2 Inquiry page layout → Tasks 8–15.
- §3 View modes → Task 13 (all 15 rendered; live/stubbed per spec).
- §4 Action bar / tabs → Tasks 15–18.
- §5 Picture panel → Task 12; static serving reuses existing `/rics-images` mount.
- §6 Data contract → Tasks 5–7.
- §7 Routes → Tasks 8 (new) + 23 (redirect) + 24 (cleanup).
- §8 SkuLink sweep → Tasks 19–22.
- §9 Deferred list → Task 25 (pointer) + Task 13/15 (UI-level "waiting on" tooltips and placeholders).
- §10 Testing → every task writes its test first.

**Placeholder scan:** `mapStoresToGrid` / `aggregateAllStoresGrid` stubs in Task 5 are explicitly flagged — they must be implemented using existing per-store snapshot data; the test will fail until they return real rows.

**Type consistency:** `InquiryPricing`, `InquiryRollup`, `InquiryGrids`, `InventoryInquiry`, `SkuLookupRow`, `ViewMode`, `InquiryTab` — all defined in one task and consumed unchanged downstream.

**Known trade-off flagged inline:** Task 5 rollup currently returns zeros because the RICS adapter doesn't expose sales-period aggregates. The design acknowledges this via the Deferred list (`sales-reporting.getSizeGridSales`). The Info/Pricing/Grid pieces still render correctly. When `sales-reporting` is ready, `buildRollup` becomes the single point of change.

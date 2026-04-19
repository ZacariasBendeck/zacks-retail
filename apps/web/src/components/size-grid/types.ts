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
  /** Grid-level total pre-computed by the backend (may differ from the sum of cells). Not rendered yet — exposed for future callers. */
  total?: number;
}

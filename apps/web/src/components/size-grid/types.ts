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

type SortDirection = 'ascend' | 'descend'

type RowGetter<T> = keyof T | ((row: T) => unknown)

const textCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
})

export const SALES_ANALYSIS_TEXT_SORT_DIRECTIONS: SortDirection[] = ['ascend', 'descend']
export const SALES_ANALYSIS_NUMERIC_SORT_DIRECTIONS: SortDirection[] = ['descend', 'ascend']

function readValue<T>(row: T, getter: RowGetter<T>): unknown {
  return typeof getter === 'function' ? getter(row) : row[getter]
}

export function salesAnalysisTextSorter<T>(getter: RowGetter<T>): (a: T, b: T) => number {
  return (a, b) => {
    const aValue = readValue(a, getter)
    const bValue = readValue(b, getter)
    return textCollator.compare(String(aValue ?? ''), String(bValue ?? ''))
  }
}

export function salesAnalysisNumberSorter<T>(getter: RowGetter<T>): (a: T, b: T) => number {
  return (a, b) => {
    const aRaw = readValue(a, getter)
    const bRaw = readValue(b, getter)
    const aNumber = aRaw == null || aRaw === '' ? Number.NaN : Number(aRaw)
    const bNumber = bRaw == null || bRaw === '' ? Number.NaN : Number(bRaw)
    const aValue = Number.isFinite(aNumber) ? aNumber : Number.NEGATIVE_INFINITY
    const bValue = Number.isFinite(bNumber) ? bNumber : Number.NEGATIVE_INFINITY
    return aValue - bValue
  }
}

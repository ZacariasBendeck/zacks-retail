import { useQuery } from '@tanstack/react-query'

/** Mirrors backend CategoryWithDept. `familyCode === ''` means "no mapping". */
export interface PostgresCategory {
  categoryNumber: number
  categoryDesc: string
  departmentNumber: number | null
  departmentDesc: string | null
  familyCode: string
}

export interface CategoryFamilyResolution {
  categoryNumber: number
  categoryDesc: string
  departmentNumber: number
  departmentDesc: string
  familyCode: string
  familyLabelEs: string
}

async function fetchAllCategories(): Promise<PostgresCategory[]> {
  const res = await fetch('/api/v1/products/categories')
  if (!res.ok) throw new Error(`Failed to fetch categories: ${res.status}`)
  return res.json()
}

async function fetchFamilyByCategory(
  categoryNumber: number,
): Promise<CategoryFamilyResolution | null> {
  const res = await fetch(`/api/v1/products/families/by-category/${categoryNumber}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Failed to resolve family for ${categoryNumber}: ${res.status}`)
  return res.json()
}

/** Global catalog — all RICS categories joined with their Product Family.
 *  Used to build the grouped Category picker on the SKU form. */
export function useAllPostgresCategories() {
  return useQuery({
    queryKey: ['product-categories', 'all'],
    queryFn: fetchAllCategories,
    staleTime: 10 * 60 * 1000,
  })
}

/** Resolve one category (by its RICS number) to its family + department. Used
 *  when the user picks a category on the form, so the family badge + department
 *  auto-fill. */
export function useFamilyByCategory(categoryNumber: number | null | undefined) {
  return useQuery({
    queryKey: ['product-categories', 'by-category', categoryNumber],
    queryFn: () => fetchFamilyByCategory(categoryNumber!),
    enabled: categoryNumber != null,
    staleTime: 10 * 60 * 1000,
  })
}

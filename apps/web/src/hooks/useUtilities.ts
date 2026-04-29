/**
 * TanStack Query hooks for the utilities module.
 *
 * - useSkuLookup(criteria): debounced preview for the criteria picker
 * - useApplyBatchChange: mutation, with onSuccess invalidating batch list
 * - useBatchOperations(params): list for Batch History page
 * - useBatchOperation(id): detail + items
 * - useUndoBatch: undo mutation
 */

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  skuLookupApi,
  utilitiesApi,
  type SkuCriteria,
  type BatchOperationType,
  type AttributeChange,
  type LookupResult,
} from '../services/utilitiesApi'

const EMPTY_LOOKUP: LookupResult = { count: 0, skus: [], sample: [] }

/** Debounced criteria lookup for the picker preview. 400ms debounce keeps typing snappy. */
export function useSkuLookup(criteria: SkuCriteria, sampleLimit = 5) {
  const [debounced, setDebounced] = useState<SkuCriteria>(criteria)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(criteria), 400)
    return () => clearTimeout(t)
  }, [criteria])

  const enabled = hasAnyCriterion(debounced)

  return useQuery({
    queryKey: ['utilities', 'sku-lookup', debounced, sampleLimit],
    queryFn: () => skuLookupApi.lookup(debounced, sampleLimit),
    enabled,
    staleTime: 30_000,
    placeholderData: (prev) => prev ?? EMPTY_LOOKUP,
  })
}

export function useApplyBatchChange() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      operationType: BatchOperationType
      criteria: SkuCriteria
      change: AttributeChange
      dryRun?: boolean
    }) =>
      utilitiesApi.applyBatchChange(
        { operationType: input.operationType, criteria: input.criteria, change: input.change },
        { dryRun: input.dryRun },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['utilities', 'batch'] })
      qc.invalidateQueries({ queryKey: ['utilities', 'sku-lookup'] })
      qc.invalidateQueries({ queryKey: ['products-skus'] })
      qc.invalidateQueries({ queryKey: ['products-attributes'] })
    },
  })
}

export function useBatchOperations(params: {
  limit?: number
  offset?: number
  operationType?: BatchOperationType
} = {}) {
  return useQuery({
    queryKey: ['utilities', 'batch', params],
    queryFn: () => utilitiesApi.listBatchOperations(params),
    staleTime: 10_000,
  })
}

export function useBatchOperation(id: string | undefined) {
  return useQuery({
    queryKey: ['utilities', 'batch', id],
    queryFn: () => utilitiesApi.getBatchOperation(id!),
    enabled: !!id,
  })
}

export function useUndoBatch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => utilitiesApi.undoBatchOperation(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['utilities', 'batch'] })
      qc.invalidateQueries({ queryKey: ['utilities', 'sku-lookup'] })
    },
  })
}

function hasAnyCriterion(c: SkuCriteria): boolean {
  return !!(
    (c.skus && c.skus.length) ||
    (c.categories && c.categories.length) ||
    (c.vendors && c.vendors.length) ||
    (c.seasons && c.seasons.length) ||
    (c.stylesColors && c.stylesColors.length) ||
    (c.groups && c.groups.length) ||
    (c.keywords && c.keywords.length) ||
    Object.values(c.attributes ?? {}).some((values) => values.length > 0) ||
    c.onlyFuturePriceChanges ||
    c.onlyWtdSales
  )
}

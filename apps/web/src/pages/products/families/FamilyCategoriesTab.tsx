import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  App,
  Button,
  Collapse,
  Empty,
  Select,
  Space,
  Spin,
  Steps,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { ColumnsType, TableRowSelection } from 'antd/es/table/interface'
import {
  useAllPostgresCategories,
  type PostgresCategory,
} from '../../../hooks/useProductCategories'
import {
  useDepartments,
  useSectors,
} from '../../../hooks/useProductsTaxonomy'
import {
  useFamilyCategories,
  useProductFamilies,
  useReplaceFamilyCategories,
} from '../../../hooks/useProductFamilies'
import type { Department, Sector } from '../../../types/productsTaxonomy'
import type { ProductFamily } from '../../../types/sku'

interface Props {
  family: ProductFamily
}

interface ScopedCategory extends PostgresCategory {
  departmentNumber: number | null
  departmentDesc: string | null
  sectorNumber: number | null
  sectorDesc: string | null
}

type WizardStep = 0 | 1 | 2
type ReviewRow = ScopedCategory & { changeType: 'Added' | 'Moved' | 'Removed' }

function sameNumberSet(left: Set<number>, right: Set<number>): boolean {
  if (left.size !== right.size) return false
  for (const value of left) {
    if (!right.has(value)) return false
  }
  return true
}

function sortedNumbers(values: Iterable<number>): number[] {
  return Array.from(values).sort((a, b) => a - b)
}

function departmentForCategory(
  category: PostgresCategory,
  departments: Department[],
): Department | null {
  if (category.departmentNumber != null) {
    return (
      departments.find((department) => department.number === category.departmentNumber) ??
      null
    )
  }
  return (
    departments.find(
      (department) =>
        category.categoryNumber >= department.begCateg &&
        category.categoryNumber <= department.endCateg,
    ) ?? null
  )
}

function sectorForDepartment(
  departmentNumber: number | null,
  sectors: Sector[],
): Sector | null {
  if (departmentNumber == null) return null
  return (
    sectors.find(
      (sector) =>
        departmentNumber >= sector.begDept &&
        departmentNumber <= sector.endDept,
    ) ?? null
  )
}

function groupByDepartment(rows: ScopedCategory[]) {
  const groups = new Map<string, { key: string; label: string; rows: ScopedCategory[] }>()
  for (const row of rows) {
    const key = row.departmentNumber == null ? 'unmapped' : String(row.departmentNumber)
    const label =
      row.departmentNumber == null
        ? 'No department'
        : `${row.departmentNumber} - ${row.departmentDesc ?? 'Department'}`
    const existing = groups.get(key)
    if (existing) {
      existing.rows.push(row)
    } else {
      groups.set(key, { key, label, rows: [row] })
    }
  }
  return Array.from(groups.values()).sort((a, b) => {
    const aNum = a.key === 'unmapped' ? Number.MAX_SAFE_INTEGER : Number(a.key)
    const bNum = b.key === 'unmapped' ? Number.MAX_SAFE_INTEGER : Number(b.key)
    return aNum - bNum
  })
}

function familyLabel(code: string, families: ProductFamily[] | undefined): string {
  if (!code) return 'Unassigned'
  return families?.find((family) => family.code === code)?.labelEs ?? code
}

function scopedChangeRows(
  rows: ScopedCategory[],
  baselineAssigned: Set<number>,
  draftAssigned: Set<number>,
  currentFamilyCode: string,
) {
  const added: ScopedCategory[] = []
  const reassigned: ScopedCategory[] = []
  const removed: ScopedCategory[] = []

  for (const row of rows) {
    const wasAssigned = baselineAssigned.has(row.categoryNumber)
    const isAssigned = draftAssigned.has(row.categoryNumber)
    if (!wasAssigned && isAssigned) {
      if (row.familyCode && row.familyCode !== currentFamilyCode) reassigned.push(row)
      else added.push(row)
    }
    if (wasAssigned && !isAssigned) removed.push(row)
  }

  return { added, reassigned, removed }
}

function categoryColumns<T extends ScopedCategory>(
  currentFamily: ProductFamily,
  families: ProductFamily[] | undefined,
): ColumnsType<T> {
  return [
    {
      title: 'Category',
      key: 'category',
      render: (_value, row) => (
        <Space size={6} wrap>
          <Tag>{row.categoryNumber}</Tag>
          <Typography.Text>{row.categoryDesc}</Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Current family',
      key: 'family',
      width: 230,
      render: (_value, row) => {
        if (!row.familyCode) return <Typography.Text type="secondary">Unassigned</Typography.Text>
        if (row.familyCode === currentFamily.code) {
          return <Tag color="green">{currentFamily.labelEs}</Tag>
        }
        return <Tag color="orange">Move from {familyLabel(row.familyCode, families)}</Tag>
      },
    },
  ]
}

/**
 * Category assignment wizard for one Product Family. Draft state always holds
 * the full category set for the family, so sector/department edits preserve
 * mappings outside the current scope when saving the replacement payload.
 */
export default function FamilyCategoriesTab({ family }: Props) {
  const { message } = App.useApp()
  const categoriesQuery = useAllPostgresCategories()
  const { data: assignedCategories, isLoading: assignedLoading } = useFamilyCategories(family.code)
  const { data: allFamilies } = useProductFamilies()
  const { data: sectors, error: sectorsError, isLoading: sectorsLoading } = useSectors()
  const {
    data: departments,
    error: departmentsError,
    isLoading: departmentsLoading,
  } = useDepartments()
  const replace = useReplaceFamilyCategories()

  const [currentStep, setCurrentStep] = useState<WizardStep>(0)
  const [sectorNumber, setSectorNumber] = useState<number | null>(null)
  const [departmentNumber, setDepartmentNumber] = useState<number | null>(null)
  const [baselineAssigned, setBaselineAssigned] = useState<Set<number>>(new Set())
  const [draftAssigned, setDraftAssigned] = useState<Set<number>>(new Set())
  const [pendingError, setPendingError] = useState<string | null>(null)

  useEffect(() => {
    setCurrentStep(0)
    setSectorNumber(null)
    setDepartmentNumber(null)
    setPendingError(null)
  }, [family.code])

  useEffect(() => {
    if (!assignedCategories) return
    const next = new Set(assignedCategories.map((category) => category.categoryNumber))
    setBaselineAssigned(next)
    setDraftAssigned(new Set(next))
    setPendingError(null)
  }, [assignedCategories])

  const enrichedCategories = useMemo<ScopedCategory[]>(() => {
    if (!categoriesQuery.data || !departments || !sectors) return []
    return categoriesQuery.data
      .map((category) => {
        const department = departmentForCategory(category, departments)
        const sector = sectorForDepartment(department?.number ?? null, sectors)
        return {
          ...category,
          departmentNumber: department?.number ?? category.departmentNumber ?? null,
          departmentDesc: department?.description ?? category.departmentDesc ?? null,
          sectorNumber: sector?.number ?? null,
          sectorDesc: sector?.description ?? null,
        }
      })
      .sort(
        (a, b) =>
          (a.sectorNumber ?? Number.MAX_SAFE_INTEGER) -
            (b.sectorNumber ?? Number.MAX_SAFE_INTEGER) ||
          (a.departmentNumber ?? Number.MAX_SAFE_INTEGER) -
            (b.departmentNumber ?? Number.MAX_SAFE_INTEGER) ||
          a.categoryNumber - b.categoryNumber,
      )
  }, [categoriesQuery.data, departments, sectors])

  useEffect(() => {
    if (sectorNumber != null || !sectors || enrichedCategories.length === 0) return
    const assignedSector = enrichedCategories.find((category) =>
      baselineAssigned.has(category.categoryNumber),
    )?.sectorNumber
    const firstSectorWithCategories = sectors
      .map((sector) => sector.number)
      .find((number) => enrichedCategories.some((category) => category.sectorNumber === number))
    setSectorNumber(assignedSector ?? firstSectorWithCategories ?? sectors[0]?.number ?? null)
  }, [baselineAssigned, enrichedCategories, sectors, sectorNumber])

  useEffect(() => {
    if (departmentNumber == null || sectorNumber == null || !departments || !sectors) return
    const sector = sectors.find((row) => row.number === sectorNumber)
    if (!sector) return
    const departmentStillInSector =
      departmentNumber >= sector.begDept && departmentNumber <= sector.endDept
    if (!departmentStillInSector) setDepartmentNumber(null)
  }, [departmentNumber, departments, sectorNumber, sectors])

  const sectorOptions = useMemo(
    () =>
      (sectors ?? [])
        .filter((sector) =>
          enrichedCategories.some((category) => category.sectorNumber === sector.number),
        )
        .map((sector) => {
          const count = enrichedCategories.filter(
            (category) => category.sectorNumber === sector.number,
          ).length
          return {
            value: sector.number,
            label: `${sector.number} - ${sector.description} (${count})`,
          }
        }),
    [enrichedCategories, sectors],
  )

  const departmentOptions = useMemo(() => {
    const scoped = sectorNumber == null
      ? enrichedCategories
      : enrichedCategories.filter((category) => category.sectorNumber === sectorNumber)
    const seen = new Set<number>()
    return scoped
      .filter((category) => category.departmentNumber != null)
      .flatMap((category) => {
        const number = category.departmentNumber!
        if (seen.has(number)) return []
        seen.add(number)
        const count = scoped.filter((row) => row.departmentNumber === number).length
        return [{
          value: number,
          label: `${number} - ${category.departmentDesc ?? 'Department'} (${count})`,
        }]
      })
      .sort((a, b) => a.value - b.value)
  }, [enrichedCategories, sectorNumber])

  const scopedCategories = useMemo(
    () =>
      enrichedCategories.filter((category) => {
        if (sectorNumber != null && category.sectorNumber !== sectorNumber) return false
        if (departmentNumber != null && category.departmentNumber !== departmentNumber) return false
        return sectorNumber != null
      }),
    [departmentNumber, enrichedCategories, sectorNumber],
  )

  const selectedSector = sectors?.find((sector) => sector.number === sectorNumber) ?? null
  const isDirty = !sameNumberSet(baselineAssigned, draftAssigned)
  const scopedCurrentInFamily = scopedCategories.filter(
    (category) => category.familyCode === family.code,
  ).length
  const scopedAssignedElsewhere = scopedCategories.filter(
    (category) => category.familyCode && category.familyCode !== family.code,
  ).length
  const scopedUnassigned = scopedCategories.filter((category) => !category.familyCode).length
  const scopedSelected = scopedCategories.filter((category) =>
    draftAssigned.has(category.categoryNumber),
  ).length
  const reviewChanges = useMemo(
    () => scopedChangeRows(enrichedCategories, baselineAssigned, draftAssigned, family.code),
    [baselineAssigned, draftAssigned, enrichedCategories, family.code],
  )
  const totalChangeCount =
    reviewChanges.added.length + reviewChanges.reassigned.length + reviewChanges.removed.length

  const setCategoryAssigned = (categoryNumber: number, assigned: boolean) => {
    setDraftAssigned((prev) => {
      const next = new Set(prev)
      if (assigned) next.add(categoryNumber)
      else next.delete(categoryNumber)
      return next
    })
    setPendingError(null)
  }

  const setManyAssigned = (rows: ScopedCategory[], assigned: boolean) => {
    setDraftAssigned((prev) => {
      const next = new Set(prev)
      for (const row of rows) {
        if (assigned) next.add(row.categoryNumber)
        else next.delete(row.categoryNumber)
      }
      return next
    })
    setPendingError(null)
  }

  const resetDraft = () => {
    setDraftAssigned(new Set(baselineAssigned))
    setPendingError(null)
  }

  const handleSave = async (force = false) => {
    try {
      const result = await replace.mutateAsync({
        code: family.code,
        categories: sortedNumbers(draftAssigned),
        force,
      })
      message.success(
        `Saved: +${result.assigned} / moved ${result.reassigned} / removed ${result.removed}`,
      )
      setBaselineAssigned(new Set(draftAssigned))
      setPendingError(null)
    } catch (e) {
      const err = e as Error & { status?: number }
      if (err.status === 409 && !force) {
        setPendingError(err.message)
        setCurrentStep(2)
      } else {
        message.error(err.message)
      }
    }
  }

  const columns = categoryColumns<ScopedCategory>(family, allFamilies)

  const reviewColumns: ColumnsType<ReviewRow> = [
    {
      title: 'Change',
      dataIndex: 'changeType',
      key: 'changeType',
      width: 120,
      render: (value: ReviewRow['changeType']) => {
        if (value === 'Added') return <Tag color="green">Added</Tag>
        if (value === 'Moved') return <Tag color="orange">Moved</Tag>
        return <Tag color="red">Removed</Tag>
      },
    },
    ...categoryColumns<ReviewRow>(family, allFamilies),
  ]

  const reviewRows: ReviewRow[] = [
    ...reviewChanges.added.map((row) => ({ ...row, changeType: 'Added' as const })),
    ...reviewChanges.reassigned.map((row) => ({ ...row, changeType: 'Moved' as const })),
    ...reviewChanges.removed.map((row) => ({ ...row, changeType: 'Removed' as const })),
  ]

  const renderStats = () => (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
        gap: 8,
      }}
    >
      {[
        ['Visible', scopedCategories.length],
        ['In this family', scopedCurrentInFamily],
        ['Assigned elsewhere', scopedAssignedElsewhere],
        ['Unassigned', scopedUnassigned],
        ['Selected now', scopedSelected],
      ].map(([label, value]) => (
        <div
          key={String(label)}
          style={{
            border: '1px solid #f0f0f0',
            borderRadius: 6,
            padding: '8px 10px',
          }}
        >
          <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
            {label}
          </Typography.Text>
          <Typography.Text strong style={{ fontSize: 18 }}>
            {Number(value).toLocaleString()}
          </Typography.Text>
        </div>
      ))}
    </div>
  )

  const renderScope = () => (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Space wrap align="end">
        <div>
          <Typography.Text strong style={{ display: 'block', marginBottom: 4 }}>
            Sector
          </Typography.Text>
          <Select
            showSearch
            style={{ width: 320 }}
            placeholder="Select sector"
            optionFilterProp="label"
            value={sectorNumber ?? undefined}
            options={sectorOptions}
            onChange={(value) => {
              setSectorNumber(value)
              setDepartmentNumber(null)
              setPendingError(null)
            }}
          />
        </div>
        <div>
          <Typography.Text strong style={{ display: 'block', marginBottom: 4 }}>
            Department
          </Typography.Text>
          <Select
            allowClear
            showSearch
            style={{ width: 360 }}
            placeholder="All departments in sector"
            optionFilterProp="label"
            value={departmentNumber ?? undefined}
            options={departmentOptions}
            onChange={(value) => {
              setDepartmentNumber(value ?? null)
              setPendingError(null)
            }}
          />
        </div>
      </Space>
      {renderStats()}
      {selectedSector ? (
        <Typography.Text type="secondary">
          {selectedSector.number} - {selectedSector.description}
        </Typography.Text>
      ) : null}
    </Space>
  )

  const renderCategoryGroup = (group: ReturnType<typeof groupByDepartment>[number]) => {
    const rowSelection: TableRowSelection<ScopedCategory> = {
      selectedRowKeys: group.rows
        .filter((row) => draftAssigned.has(row.categoryNumber))
        .map((row) => row.categoryNumber),
      onSelect: (row, selected) => setCategoryAssigned(row.categoryNumber, selected),
      onSelectAll: (selected, _selectedRows, changeRows) =>
        setManyAssigned(changeRows, selected),
    }

    return (
      <Table<ScopedCategory>
        size="small"
        rowKey="categoryNumber"
        rowSelection={rowSelection}
        columns={columns}
        dataSource={group.rows}
        pagination={false}
      />
    )
  }

  const renderSelect = () => {
    const groups = groupByDepartment(scopedCategories)
    if (groups.length === 0) return <Empty description="No categories in this scope" />
    return (
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Space wrap>
          <Button onClick={() => setManyAssigned(scopedCategories, true)}>
            Assign all visible
          </Button>
          <Button onClick={() => setManyAssigned(scopedCategories, false)}>
            Remove all visible
          </Button>
          <Button disabled={!isDirty} onClick={resetDraft}>
            Reset draft
          </Button>
        </Space>
        <Collapse
          defaultActiveKey={groups.map((group) => group.key)}
          items={groups.map((group) => ({
            key: group.key,
            label: (
              <Space wrap>
                <Typography.Text strong>{group.label}</Typography.Text>
                <Tag>{group.rows.length}</Tag>
                <Tag color="green">
                  {group.rows.filter((row) => draftAssigned.has(row.categoryNumber)).length}{' '}
                  selected
                </Tag>
              </Space>
            ),
            extra: (
              <Space onClick={(event) => event.stopPropagation()}>
                <Button size="small" onClick={() => setManyAssigned(group.rows, true)}>
                  Assign department
                </Button>
                <Button size="small" onClick={() => setManyAssigned(group.rows, false)}>
                  Remove department
                </Button>
              </Space>
            ),
            children: renderCategoryGroup(group),
          }))}
        />
      </Space>
    )
  }

  const renderReview = () => (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      {pendingError ? (
        <Alert
          type="warning"
          showIcon
          message="Force confirmation required"
          description={
            <Space direction="vertical" size="small">
              <span>{pendingError}</span>
              <Space>
                <Button
                  type="primary"
                  danger
                  loading={replace.isPending}
                  onClick={() => void handleSave(true)}
                >
                  Force save
                </Button>
                <Button onClick={() => setPendingError(null)}>Cancel</Button>
              </Space>
            </Space>
          }
        />
      ) : null}
      {totalChangeCount === 0 ? (
        <Empty description="No pending changes" />
      ) : (
        <>
          <Space wrap>
            <Tag color="green">{reviewChanges.added.length} added</Tag>
            <Tag color="orange">{reviewChanges.reassigned.length} moved</Tag>
            <Tag color="red">{reviewChanges.removed.length} removed</Tag>
          </Space>
          <Table<ReviewRow>
            size="small"
            rowKey={(row) => `${row.changeType}-${row.categoryNumber}`}
            columns={reviewColumns}
            dataSource={reviewRows}
            pagination={{ pageSize: 10, hideOnSinglePage: true }}
          />
        </>
      )}
    </Space>
  )

  const isLoading =
    categoriesQuery.isLoading || assignedLoading || sectorsLoading || departmentsLoading
  if (isLoading) return <Spin />

  const loadError = categoriesQuery.error ?? sectorsError ?? departmentsError
  if (loadError) {
    return (
      <Alert
        type="error"
        message="Failed to load category assignment data"
        description={(loadError as Error).message}
      />
    )
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Steps
        current={currentStep}
        onChange={(step) => setCurrentStep(step as WizardStep)}
        items={[
          { title: 'Scope' },
          { title: 'Select' },
          { title: 'Review' },
        ]}
      />

      {currentStep === 0 ? renderScope() : null}
      {currentStep === 1 ? renderSelect() : null}
      {currentStep === 2 ? renderReview() : null}

      <Space wrap>
        <Button
          disabled={currentStep === 0}
          onClick={() => setCurrentStep((currentStep - 1) as WizardStep)}
        >
          Back
        </Button>
        {currentStep < 2 ? (
          <Button
            type="primary"
            disabled={sectorNumber == null}
            onClick={() => setCurrentStep((currentStep + 1) as WizardStep)}
          >
            {currentStep === 0 ? 'Continue to categories' : 'Review changes'}
          </Button>
        ) : (
          <Button
            type="primary"
            disabled={!isDirty || !!pendingError}
            loading={replace.isPending}
            onClick={() => void handleSave(false)}
          >
            Save assignment
          </Button>
        )}
        {isDirty ? <Typography.Text type="warning">Unsaved changes.</Typography.Text> : null}
      </Space>
    </Space>
  )
}

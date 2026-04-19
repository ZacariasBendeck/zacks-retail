import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Form,
  Input,
  InputNumber,
  Select,
  Button,
  Card,
  Row,
  Col,
  Space,
  Spin,
  Typography,
  App,
  Divider,
  Upload,
  Alert,
  Tag,
  Tooltip,
  Switch,
  AutoComplete,
} from 'antd'
import { ArrowLeftOutlined, SaveOutlined, CameraOutlined, LoadingOutlined, SearchOutlined, ThunderboltOutlined, CheckCircleOutlined, ExclamationCircleOutlined, ReloadOutlined, EyeInvisibleOutlined } from '@ant-design/icons'
import {
  useSku,
  useCreateSku,
  useUpdateSku,
  useVendors,
  useAnalyzeImage,
  useReferenceData,
  useLookupSku,
  useAutocompleteSkus,
  useStyleColors,
} from '../../hooks/useSkus'
import type {
  Department,
  SkuCreatePayload,
  ReferenceItem,
  ImageAnalysisResult,
  EnhancedAnalysisResult,
  AiFillSummary,
  StyleColorLink,
} from '../../types/sku'
import {
  ALLOWED_DEPARTMENTS,
  CATEGORY_MAX,
  CATEGORY_MIN,
  isValidCategoryCode,
  isValidDepartment,
} from '../../constants/domain'
import { SkuApiError } from '../../services/skuApi'

const DEPARTMENTS: Department[] = ALLOWED_DEPARTMENTS

type SkuFormValues = SkuCreatePayload & {
  styleColorId?: string | null
}

/** Mapping: AI response key -> form field name + reference table slug */
const AI_FIELD_MAP: { aiKey: keyof ImageAnalysisResult; formField: string; type: 'text' | 'enum' | 'reference'; refTable?: string }[] = [
  { aiKey: 'description', formField: 'webDescription', type: 'text' },
  { aiKey: 'department', formField: 'department', type: 'enum' },
  { aiKey: 'color_family', formField: 'colorId', type: 'reference', refTable: 'colors' },
  { aiKey: 'shoe_type', formField: 'shoeTypeId', type: 'reference', refTable: 'shoe-types' },
  { aiKey: 'heel_height', formField: 'heelHeightId', type: 'reference', refTable: 'heel-heights' },
  { aiKey: 'heel_shape', formField: 'heelShapeId', type: 'reference', refTable: 'heel-shapes' },
  { aiKey: 'toe_shape', formField: 'toeShapeId', type: 'reference', refTable: 'toe-shapes' },
  { aiKey: 'upper_material', formField: 'upperMaterialId', type: 'reference', refTable: 'upper-materials' },
  { aiKey: 'finish', formField: 'finishId', type: 'reference', refTable: 'finishes' },
  { aiKey: 'pattern', formField: 'patternId', type: 'reference', refTable: 'patterns' },
  { aiKey: 'occasion', formField: 'occasionId', type: 'reference', refTable: 'occasions' },
  { aiKey: 'category', formField: 'categoryId', type: 'reference', refTable: 'categories' },
]

/** Normalize string for comparison: lowercase, trim, remove accents */
function normalize(s: string): string {
  return s.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/** Find the best matching reference item by name (case-insensitive, accent-insensitive, substring) */
function matchReference(aiValue: string, items: ReferenceItem[]): number | null {
  if (!aiValue || !items?.length) return null
  const norm = normalize(aiValue)

  // Exact match first
  const exact = items.find((i) => normalize(i.name) === norm)
  if (exact) return exact.id

  // Substring match: AI value contained in ref name or vice versa
  const substr = items.find((i) => {
    const refNorm = normalize(i.name)
    return refNorm.includes(norm) || norm.includes(refNorm)
  })
  if (substr) return substr.id

  // Word overlap: split both into words, find best overlap
  const aiWords = norm.split(/[\s/,]+/).filter(Boolean)
  let bestScore = 0
  let bestItem: ReferenceItem | null = null
  for (const item of items) {
    const refWords = normalize(item.name).split(/[\s/,]+/).filter(Boolean)
    const overlap = aiWords.filter((w) => refWords.some((rw) => rw.includes(w) || w.includes(rw))).length
    const score = overlap / Math.max(aiWords.length, refWords.length)
    if (score > bestScore && score >= 0.5) {
      bestScore = score
      bestItem = item
    }
  }
  return bestItem?.id ?? null
}

function refOptions(items: ReferenceItem[] | undefined) {
  if (!items) return []
  return items.map((i) => ({ label: i.name, value: i.id }))
}

const AI_FILLED_STYLE: React.CSSProperties = {
  borderLeft: '3px solid #52c41a',
  paddingLeft: 8,
  borderRadius: 4,
  transition: 'border-color 0.3s',
}

/** Wrap a Form.Item label with an AI-filled indicator */
function aiLabel(label: string, fieldName: string, filledSet: Set<string>): React.ReactNode {
  if (!filledSet.has(fieldName)) return label
  return (
    <span>
      {label} <ThunderboltOutlined style={{ color: '#52c41a', fontSize: 11 }} />
    </span>
  )
}

export default function SkuFormPage() {
  const { skuId } = useParams<{ skuId: string }>()
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [form] = Form.useForm()

  const isRouteEdit = !!skuId
  const { data: sku, isLoading: skuLoading } = useSku(skuId)
  const { data: vendors, isLoading: vendorsLoading } = useVendors()
  const { data: refData, isLoading: refLoading } = useReferenceData()
  const createMutation = useCreateSku()
  const updateMutation = useUpdateSku()
  const analyzeMutation = useAnalyzeImage()
  const lookupMutation = useLookupSku()
  const [aiPanelOpen, setAiPanelOpen] = useState(true)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [analysisResult, setAnalysisResult] = useState<EnhancedAnalysisResult | null>(null)
  const [aiFilledFields, setAiFilledFields] = useState<Set<string>>(new Set())
  const [aiFillSummary, setAiFillSummary] = useState<AiFillSummary | null>(null)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [lastUploadedFile, setLastUploadedFile] = useState<File | null>(null)

  // Inline lookup state: tracks when a user-entered SKU code matches an existing SKU
  const [matchedSku, setMatchedSku] = useState<import('../../types/sku').Sku | null>(null)
  const isEdit = isRouteEdit || !!matchedSku

  // SKU autocomplete state
  const [skuSearchText, setSkuSearchText] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current) }
  }, [])
  const { data: autocompleteResults, isFetching: isSearching } = useAutocompleteSkus(debouncedSearch)
  const watchedDepartment = Form.useWatch('department', form) as Department | undefined
  const watchedBrandId = Form.useWatch('brandId', form) as number | undefined
  const watchedColorId = Form.useWatch('colorId', form) as number | undefined

  const styleColorFilters = useMemo(
    () => ({
      active: true,
      department: isValidDepartment(watchedDepartment) ? watchedDepartment : undefined,
      brandId: watchedBrandId,
      colorId: watchedColorId,
    }),
    [watchedDepartment, watchedBrandId, watchedColorId],
  )
  const { data: styleColors, isLoading: styleColorsLoading } = useStyleColors(
    styleColorFilters,
    true,
  )

  const skuSearchOptions = useMemo(() => {
    if (!autocompleteResults?.length) return []
    return autocompleteResults.map((s) => ({
      value: s.skuCode,
      label: (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ fontWeight: 500 }}>{s.skuCode}</span>
          <span style={{ color: '#888', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {s.style}{s.brandName ? ` · ${s.brandName}` : ''}
          </span>
        </div>
      ),
    }))
  }, [autocompleteResults])

  const styleColorMap = useMemo(() => {
    const map = new Map<string, StyleColorLink>()
    for (const styleColor of styleColors ?? []) {
      map.set(styleColor.styleColorId, styleColor)
    }
    return map
  }, [styleColors])

  const styleColorOptions = useMemo(() => {
    return (styleColors ?? []).map((styleColor) => ({
      value: styleColor.styleColorId,
      label: `${styleColor.style} · ${styleColor.department} · cat ${styleColor.categoryId}`,
    }))
  }, [styleColors])

  const validCategoriesById = useMemo(() => {
    const map = new Map<number, { id: number; ricsCode?: number; name: string; deptMacro?: string }>()
    const categories = (refData?.['categories'] ?? []) as {
      id: number
      ricsCode?: number
      name: string
      deptMacro?: string
    }[]

    for (const category of categories) {
      if (!isValidCategoryCode(category.ricsCode)) continue
      if (!isValidDepartment(category.deptMacro)) continue
      map.set(category.id, category)
    }
    return map
  }, [refData])

  // Auto-fill department when category changes
  const handleCategoryChange = useCallback((categoryId: number | null) => {
    if (!categoryId) {
      form.setFieldsValue({ department: undefined })
      return
    }
    const category = validCategoriesById.get(categoryId)
    if (category?.deptMacro && isValidDepartment(category.deptMacro)) {
      form.setFields([
        { name: 'categoryId', errors: [] },
        { name: 'department', errors: [] },
      ])
      form.setFieldsValue({ department: category.deptMacro })
    } else {
      form.setFields([
        {
          name: 'categoryId',
          errors: [
            `Category must be between ${CATEGORY_MIN}-${CATEGORY_MAX} and mapped to an allowed macro-department.`,
          ],
        },
      ])
      form.setFieldsValue({ department: undefined })
    }
  }, [form, validCategoriesById])

  const handleStyleColorChange = useCallback((styleColorId: string | null) => {
    if (!styleColorId) return
    const styleColor = styleColorMap.get(styleColorId)
    if (!styleColor) return

    const nextValues: Partial<SkuFormValues> = {
      style: styleColor.style,
      brandId: styleColor.brandId,
      colorId: styleColor.colorId,
      categoryId: styleColor.categoryId,
      department: styleColor.department,
      heelTypeCode: styleColor.heelTypeCode ?? null,
      heelMaterialTypeCode: styleColor.heelMaterialTypeCode ?? null,
      season: styleColor.season ?? undefined,
    }

    form.setFieldsValue(nextValues)
    message.success('Plantilla style-color aplicada al formulario')
  }, [form, message, styleColorMap])

  /** Apply AI results to form fields using client-side matching */
  const applyAiFill = useCallback((result: EnhancedAnalysisResult) => {
    if (!refData) return

    const fieldsToSet: Record<string, any> = {}
    const filled: string[] = []
    const skipped: string[] = []

    for (const mapping of AI_FIELD_MAP) {
      const aiValue = result.raw[mapping.aiKey]
      if (!aiValue) {
        skipped.push(mapping.formField)
        continue
      }

      if (mapping.type === 'text') {
        fieldsToSet[mapping.formField] = aiValue
        filled.push(mapping.formField)
      } else if (mapping.type === 'enum' && mapping.formField === 'department') {
        const dept = DEPARTMENTS.find((d) => d.toLowerCase() === aiValue.toLowerCase() && isValidDepartment(d))
        if (dept) {
          fieldsToSet[mapping.formField] = dept
          filled.push(mapping.formField)
        } else {
          skipped.push(mapping.formField)
        }
      } else if (mapping.type === 'reference' && mapping.refTable) {
        // Use backend-mapped ID if available, else client-side match
        const mappedId = result.mapped?.[mapping.formField]
        const refItems = refData[mapping.refTable] ?? []
        const matchedId = mappedId ?? matchReference(aiValue, refItems)
        if (matchedId != null) {
          if (mapping.formField === 'categoryId') {
            const cat = validCategoriesById.get(matchedId)
            if (cat?.deptMacro && isValidDepartment(cat.deptMacro)) {
              fieldsToSet[mapping.formField] = matchedId
              filled.push(mapping.formField)
              fieldsToSet['department'] = cat.deptMacro
            } else {
              skipped.push('categoryId')
            }
          } else {
            fieldsToSet[mapping.formField] = matchedId
            filled.push(mapping.formField)
          }
        } else {
          skipped.push(mapping.formField)
        }
      }
    }

    form.setFieldsValue(fieldsToSet)
    setAiFilledFields(new Set(filled))
    setAiFillSummary({ filled, skipped, total: AI_FIELD_MAP.length })
  }, [refData, form, validCategoriesById])

  /** Populate form fields from a SKU object */
  const populateForm = useCallback((s: import('../../types/sku').Sku) => {
    form.setFieldsValue({
      skuCode: s.skuCode,
      style: s.style,
      price: s.price,
      cost: s.cost,
      categoryId: s.categoryId,
      department: s.department,
      vendorId: s.vendorId,
      vendorSku: s.vendorSku,
      barcode: s.barcode,
      ricsDescription: s.ricsDescription,
      webDescription: s.webDescription,
      comment: s.comment,
      keywords: s.keywords,
      season: s.season,
      manufacturer: s.manufacturer,
      brandId: s.brandId,
      colorId: s.colorId,
      heelMaterialId: s.heelMaterialId,
      heelTypeCode: s.heelTypeCode ?? null,
      heelMaterialTypeCode: s.heelMaterialTypeCode ?? null,
      shoeTypeId: s.shoeTypeId,
      heelShapeId: s.heelShapeId,
      heelHeightId: s.heelHeightId,
      toeShapeId: s.toeShapeId,
      closureTypeId: s.closureTypeId,
      upperMaterialId: s.upperMaterialId,
      outsoleMaterialId: s.outsoleMaterialId,
      finishId: s.finishId,
      widthTypeId: s.widthTypeId,
      patternId: s.patternId,
      occasionId: s.occasionId,
      targetAudienceId: s.targetAudienceId,
      accessoryId: s.accessoryId,
      seasonId: s.seasonId,
      labelTypeId: s.labelTypeId,
      styleColorId: s.styleColor?.styleColorId ?? null,
    })
  }, [form])

  useEffect(() => {
    if (sku) populateForm(sku)
  }, [sku, populateForm])

  /** Look up SKU code — if it exists, populate form & switch to update mode */
  const handleSkuCodeLookup = useCallback(async (code: string) => {
    if (!code.trim()) {
      setMatchedSku(null)
      return
    }
    try {
      const found = await lookupMutation.mutateAsync(code.trim())
      if (found) {
        setMatchedSku(found)
        populateForm(found)
        message.info(`SKU existente encontrado: ${found.skuCode} — modo edicion`)
      } else {
        setMatchedSku(null)
      }
    } catch {
      setMatchedSku(null)
    }
  }, [lookupMutation, populateForm, message])

  /** Reset form back to create mode */
  const handleResetToCreate = useCallback(() => {
    const currentCode = form.getFieldValue('skuCode')
    setMatchedSku(null)
    form.resetFields()
    form.setFieldsValue({ skuCode: currentCode })
    message.info('Modo crear activado')
  }, [form, message])

  const handleSubmit = async (values: SkuFormValues) => {
    try {
      const { styleColorId: _styleColorId, ...payload } = values
      const editId = skuId ?? matchedSku?.id
      if (editId) {
        const { skuCode: _omit, ...updateValues } = payload as SkuCreatePayload & { skuCode?: string }
        await updateMutation.mutateAsync({ skuId: editId, payload: updateValues })
        message.success('SKU actualizado exitosamente')
      } else {
        await createMutation.mutateAsync(payload)
        message.success('SKU creado exitosamente')
      }
      navigate('/inventory/skus')
    } catch (err) {
      if (err instanceof SkuApiError && err.code === 'DUPLICATE_BARCODE') {
        form.setFields([{ name: 'barcode', errors: ['Este codigo de barras ya esta en uso'] }])
        return
      }

      if (err instanceof SkuApiError && err.code === 'VALIDATION_CATEGORY_RANGE') {
        const rangeMessage = err.message || `Categoria fuera de rango permitido (${CATEGORY_MIN}-${CATEGORY_MAX}).`
        form.setFields([{ name: 'categoryId', errors: [rangeMessage] }])
        message.error(rangeMessage)
        return
      }

      const errMsg = err instanceof Error ? err.message : 'Ocurrio un error'
      message.error(errMsg)
    }
  }

  const handleImageUpload = async (file: File) => {
    const previewUrl = URL.createObjectURL(file)
    setImagePreview(previewUrl)
    setAiFillSummary(null)
    setAiFilledFields(new Set())
    setAnalysisError(null)
    setAnalysisResult(null)
    setLastUploadedFile(file)

    try {
      const result = await analyzeMutation.mutateAsync(file)
      setAnalysisResult(result)
      message.success('Imagen analizada. Haz clic en "Llenar con IA" para auto-completar campos.')
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Fallo el analisis de imagen'
      setAnalysisError(errMsg)
    }
  }

  const handleRetryAnalysis = () => {
    if (lastUploadedFile) {
      handleImageUpload(lastUploadedFile)
    }
  }

  const handleFillWithAi = () => {
    if (!analysisResult) return
    applyAiFill(analysisResult)
    const summary = aiFillSummary
    if (summary) {
      message.success(`IA lleno ${summary.filled.length} de ${summary.total} campos.`)
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  // Build category options with search by name or RICS code
  // NOTE: must be above early returns to satisfy Rules of Hooks
  const categoryOptions = useMemo(() => {
    const cats = Array.from(validCategoriesById.values())
    const grouped = cats.reduce<Record<string, typeof cats>>((acc, c) => {
      const group = c.deptMacro || 'OTHER'
      if (!acc[group]) acc[group] = []
      acc[group].push(c)
      return acc
    }, {})
    return Object.entries(grouped).map(([macro, items]) => ({
      label: macro,
      options: items.map((c) => ({
        label: `${c.ricsCode ?? ''} ${c.name}`,
        value: c.id,
      })),
    }))
  }, [validCategoriesById])

  if (isRouteEdit && skuLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    )
  }

  if (refLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" tip="Cargando datos de referencia..." />
      </div>
    )
  }

  const compactItem: React.CSSProperties = { marginBottom: 8 }

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
        {/* Header with Lookup inline */}
        <Card size="small" bodyStyle={{ padding: '8px 16px' }}>
          <Row align="middle" justify="space-between" gutter={16}>
            <Col>
              <Space>
                <Button
                  icon={<ArrowLeftOutlined />}
                  onClick={() => navigate('/inventory/skus')}
                  size="small"
                >
                  Volver
                </Button>
                <Typography.Title level={4} style={{ margin: 0 }}>
                  {isEdit ? 'Editar SKU' : 'Nuevo SKU'}
                </Typography.Title>
                {isRouteEdit && sku && (
                  <Space size={4}>
                    <Tag color="blue">{sku.skuCode}</Tag>
                    {sku.styleColor?.styleColorId && (
                      <Tag color="gold">StyleColor: {sku.styleColor.styleColorId.slice(0, 8)}</Tag>
                    )}
                  </Space>
                )}
                {!isRouteEdit && matchedSku && (
                  <Space size={4}>
                    <Tag color="orange">Existente: {matchedSku.skuCode}</Tag>
                    <Button size="small" type="link" onClick={handleResetToCreate}>
                      Crear nuevo
                    </Button>
                  </Space>
                )}
              </Space>
            </Col>
            <Col>
              <Switch
                checked={aiPanelOpen}
                onChange={setAiPanelOpen}
                checkedChildren={<><CameraOutlined /> IA</>}
                unCheckedChildren={<><EyeInvisibleOutlined /> IA</>}
                style={{ minWidth: 60 }}
              />
            </Col>
          </Row>
        </Card>

        {/* AI Image Analysis — collapsible */}
        {aiPanelOpen && (
          <Card size="small" bodyStyle={{ padding: '8px 16px' }}>
            <Row align="middle" justify="space-between">
              <Col>
                <Typography.Text strong style={{ fontSize: 13 }}><CameraOutlined /> Analisis de Imagen con IA</Typography.Text>
                <Typography.Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                  Sube una foto del zapato, luego llena atributos con IA
                </Typography.Text>
              </Col>
              <Col>
                <Tooltip title={!analysisResult && !analyzeMutation.isPending ? (analysisError ? 'Analisis fallido — ver error abajo' : 'Sube una imagen primero') : undefined}>
                  <Button
                    type="primary"
                    icon={<ThunderboltOutlined />}
                    onClick={handleFillWithAi}
                    disabled={!analysisResult || analyzeMutation.isPending}
                    style={{ fontWeight: 600 }}
                  >
                    Llenar con IA
                  </Button>
                </Tooltip>
              </Col>
            </Row>

            <Row gutter={16} style={{ marginTop: 8 }} align="top">
              <Col xs={24} sm={imagePreview ? 12 : 24}>
                <Upload.Dragger
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  showUploadList={false}
                  beforeUpload={(file) => {
                    handleImageUpload(file)
                    return false
                  }}
                  disabled={analyzeMutation.isPending}
                  style={{ padding: '8px 0' }}
                >
                  {analyzeMutation.isPending ? (
                    <div>
                      <LoadingOutlined style={{ fontSize: 20, color: '#1677ff' }} />
                      <p style={{ marginTop: 4, marginBottom: 0, fontSize: 12 }}>Analizando...</p>
                    </div>
                  ) : (
                    <div>
                      <CameraOutlined style={{ fontSize: 20, color: '#999' }} />
                      <p style={{ marginTop: 4, marginBottom: 0, fontSize: 12 }}>Haz clic o arrastra imagen del zapato</p>
                    </div>
                  )}
                </Upload.Dragger>
              </Col>
              {imagePreview && (
                <Col xs={24} sm={12}>
                  <img
                    src={imagePreview}
                    alt="Zapato subido"
                    style={{ width: '100%', maxHeight: 120, objectFit: 'contain', borderRadius: 8, border: '1px solid #d9d9d9' }}
                  />
                </Col>
              )}
            </Row>

            {analysisError && (
              <Alert
                type="error"
                showIcon
                icon={<ExclamationCircleOutlined />}
                style={{ marginTop: 8 }}
                message="Fallo el analisis de imagen"
                description={
                  <div>
                    <Typography.Text>{analysisError}</Typography.Text>
                    <div style={{ marginTop: 8 }}>
                      <Button
                        size="small"
                        icon={<ReloadOutlined />}
                        onClick={handleRetryAnalysis}
                        loading={analyzeMutation.isPending}
                      >
                        Reintentar
                      </Button>
                    </div>
                  </div>
                }
              />
            )}

            {analysisResult && !aiFillSummary && (
              <Alert
                type="info"
                showIcon
                style={{ marginTop: 8 }}
                message="Imagen analizada — lista para llenar"
                description={
                  <div style={{ fontSize: 12 }}>
                    {analysisResult.raw.shoe_type && <span><strong>Tipo:</strong> {analysisResult.raw.shoe_type} | </span>}
                    {analysisResult.raw.heel_height && <span><strong>Tacon:</strong> {analysisResult.raw.heel_height} | </span>}
                    {analysisResult.raw.upper_material && <span><strong>Material:</strong> {analysisResult.raw.upper_material} | </span>}
                    {analysisResult.raw.color_family && <span><strong>Color:</strong> {analysisResult.raw.color_family} | </span>}
                    {analysisResult.raw.occasion && <span><strong>Ocasion:</strong> {analysisResult.raw.occasion}</span>}
                    <br />
                    <Typography.Text type="secondary">Haz clic en "Llenar con IA" para completar los campos.</Typography.Text>
                  </div>
                }
              />
            )}

            {aiFillSummary && (
              <Alert
                type="success"
                showIcon
                icon={<CheckCircleOutlined />}
                style={{ marginTop: 8 }}
                message={`IA lleno ${aiFillSummary.filled.length} de ${aiFillSummary.total} campos`}
                description={
                  <div style={{ fontSize: 12 }}>
                    {aiFillSummary.filled.length > 0 && (
                      <div>
                        <strong>Llenados:</strong>{' '}
                        {aiFillSummary.filled.map((f) => (
                          <Tag key={f} color="green" style={{ marginBottom: 2 }}>{f}</Tag>
                        ))}
                      </div>
                    )}
                    {aiFillSummary.skipped.length > 0 && (
                      <div style={{ marginTop: 4 }}>
                        <strong>No determinados:</strong>{' '}
                        {aiFillSummary.skipped.map((f) => (
                          <Tag key={f} style={{ marginBottom: 2 }}>{f}</Tag>
                        ))}
                      </div>
                    )}
                    <Typography.Text type="secondary" style={{ display: 'block', marginTop: 4 }}>
                      Todos los valores llenados por IA son editables — ajusta segun sea necesario.
                    </Typography.Text>
                  </div>
                }
              />
            )}
          </Card>
        )}

        {/* Main Form — compact layout */}
        <Card size="small" bodyStyle={{ padding: '12px 16px' }}>
          <Form
            form={form}
            layout="vertical"
            onFinish={handleSubmit}
            requiredMark="optional"
            size="small"
          >
            {/* -- Codigo SKU -- */}
            {!isRouteEdit && (
              <>
                <Typography.Text strong style={{ fontSize: 13 }}>Codigo SKU</Typography.Text>
                <Row gutter={12} style={{ marginTop: 8 }}>
                  <Col xs={24} sm={8}>
                    <Form.Item
                      label="Codigo SKU"
                      name="skuCode"
                      style={compactItem}
                      extra={matchedSku ? undefined : 'Escribe para buscar SKUs existentes o ingresa un codigo nuevo'}
                    >
                      <AutoComplete
                        options={skuSearchOptions}
                        onSearch={(text) => {
                          setSkuSearchText(text)
                          if (debounceTimer.current) clearTimeout(debounceTimer.current)
                          debounceTimer.current = setTimeout(() => setDebouncedSearch(text), 300)
                        }}
                        onSelect={(value: string) => {
                          form.setFieldsValue({ skuCode: value })
                          handleSkuCodeLookup(value)
                        }}
                        onBlur={() => {
                          const code = form.getFieldValue('skuCode')
                          if (code) handleSkuCodeLookup(code)
                        }}
                        placeholder="ej. FORMAL-NIKE-BLK-001"
                        disabled={!!matchedSku}
                        popupMatchSelectWidth={400}
                        notFoundContent={isSearching ? <Spin size="small" /> : (skuSearchText.length >= 1 ? 'No se encontraron SKUs' : null)}
                      >
                        <Input
                          suffix={lookupMutation.isPending || isSearching ? <LoadingOutlined /> : <SearchOutlined style={{ color: '#999' }} />}
                          onPressEnter={(e) => {
                            e.preventDefault()
                            handleSkuCodeLookup((e.target as HTMLInputElement).value)
                          }}
                        />
                      </AutoComplete>
                    </Form.Item>
                  </Col>
                </Row>
                <Divider style={{ margin: '8px 0' }} />
              </>
            )}

            {/* -- Detalles del Producto -- */}
            <Typography.Text strong style={{ fontSize: 13 }}>Detalles del Producto</Typography.Text>

            <Row gutter={12} style={{ marginTop: 8 }}>
              <Col xs={12} sm={4}>
                <Form.Item label="Marca" name="brandId" style={compactItem}>
                  <Select placeholder="Seleccionar" allowClear showSearch optionFilterProp="label" options={refOptions(refData?.['brands'])} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={4}>
                <Form.Item label="Estilo" name="style" rules={[{ required: true, message: 'Estilo es requerido' }, { max: 100 }]} style={compactItem}>
                  <Input placeholder="ej. Oxford" />
                </Form.Item>
              </Col>
              <Col xs={12} sm={3}>
                <Form.Item label={aiLabel('Color', 'colorId', aiFilledFields)} name="colorId" style={{ ...compactItem, ...(aiFilledFields.has('colorId') ? AI_FILLED_STYLE : {}) }}>
                  <Select placeholder="Seleccionar" allowClear showSearch optionFilterProp="label" options={refOptions(refData?.['colors'])} />
                </Form.Item>
              </Col>
              <Col xs={12} sm={3}>
                <Form.Item label="Ancho" name="widthTypeId" style={compactItem}>
                  <Select placeholder="Seleccionar" allowClear options={refOptions(refData?.['width-types'])} />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={12}>
              <Col xs={24} sm={10}>
                <Form.Item
                  label="Style-Color Canonico"
                  name="styleColorId"
                  tooltip="Selector basado en /api/v1/skus/style-colors para copiar combinaciones existentes."
                  style={compactItem}
                >
                  <Select
                    placeholder="Seleccionar combinacion existente (opcional)"
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    loading={styleColorsLoading}
                    options={styleColorOptions}
                    onChange={handleStyleColorChange}
                  />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={12}>
              <Col xs={12} sm={4}>
                <Form.Item label={aiLabel('Tipo de Zapato', 'shoeTypeId', aiFilledFields)} name="shoeTypeId" style={{ ...compactItem, ...(aiFilledFields.has('shoeTypeId') ? AI_FILLED_STYLE : {}) }}>
                  <Select placeholder="Seleccionar" allowClear showSearch optionFilterProp="label" options={refOptions(refData?.['shoe-types'])} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={10}>
                <Form.Item label={aiLabel('Descripcion Web', 'webDescription', aiFilledFields)} name="webDescription" rules={[{ max: 1000 }]} style={{ ...compactItem, ...(aiFilledFields.has('webDescription') ? AI_FILLED_STYLE : {}) }}>
                  <Input.TextArea rows={1} placeholder="Descripcion en espanol" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={10}>
                <Form.Item label="Descripcion RICS" name="ricsDescription" rules={[{ max: 500 }]} style={compactItem}>
                  <Input placeholder="Auto-generado si se deja vacio" />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={12}>
              <Col xs={24} sm={12}>
                <Form.Item label="Comentario" name="comment" rules={[{ max: 1000 }]} style={compactItem}>
                  <Input.TextArea rows={1} placeholder="Notas internas" />
                </Form.Item>
              </Col>
            </Row>

            <Divider style={{ margin: '8px 0' }} />

            {/* -- Clasificacion y Proveedor -- */}
            <Typography.Text strong style={{ fontSize: 13 }}>Clasificacion y Proveedor</Typography.Text>

            <Row gutter={12} style={{ marginTop: 8 }}>
              <Col xs={12} sm={5}>
                <Form.Item
                  label={aiLabel('Categoria', 'categoryId', aiFilledFields)}
                  name="categoryId"
                  extra={`Solo categorias RICS ${CATEGORY_MIN}-${CATEGORY_MAX}; el departamento se deriva automaticamente.`}
                  rules={[
                    { required: true, message: 'Categoria es requerida' },
                    {
                      validator: (_, value: number | null | undefined) => {
                        if (value == null) return Promise.resolve()
                        const category = validCategoriesById.get(value)
                        if (!category || !isValidCategoryCode(category.ricsCode)) {
                          return Promise.reject(
                            new Error(`Categoria fuera de rango permitido (${CATEGORY_MIN}-${CATEGORY_MAX}).`),
                          )
                        }
                        if (!isValidDepartment(category.deptMacro)) {
                          return Promise.reject(
                            new Error('Categoria sin macro-departamento valido.'),
                          )
                        }
                        return Promise.resolve()
                      },
                    },
                  ]}
                  style={{ ...compactItem, ...(aiFilledFields.has('categoryId') ? AI_FILLED_STYLE : {}) }}
                >
                  <Select
                    placeholder="Buscar por nombre o codigo RICS"
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    options={categoryOptions}
                    onChange={handleCategoryChange}
                    filterOption={(input, option) => {
                      const label = String(option?.label ?? '').toLowerCase()
                      const search = input.toLowerCase()
                      return label.includes(search)
                    }}
                  />
                </Form.Item>
              </Col>
              <Col xs={12} sm={4}>
                <Form.Item
                  label={aiLabel('Departamento', 'department', aiFilledFields)}
                  name="department"
                  rules={[
                    { required: true, message: 'Departamento es requerido' },
                    {
                      validator: (_, value: string | undefined) =>
                        isValidDepartment(value)
                          ? Promise.resolve()
                          : Promise.reject(new Error('Departamento invalido para estandar macro.')),
                    },
                  ]}
                  style={{ ...compactItem, ...(aiFilledFields.has('department') ? AI_FILLED_STYLE : {}) }}
                >
                  <Select placeholder="Se llena con categoria" options={DEPARTMENTS.map((d) => ({ label: d, value: d }))} disabled />
                </Form.Item>
              </Col>
              <Col xs={12} sm={3}>
                <Form.Item label="Temporada" name="seasonId" style={compactItem}>
                  <Select placeholder="Seleccionar" allowClear options={refOptions(refData?.['seasons'])} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={4}>
                <Form.Item label="Proveedor" name="vendorId" rules={[{ required: true, message: 'Proveedor es requerido' }]} style={compactItem}>
                  <Select placeholder="Buscar..." showSearch optionFilterProp="label" loading={vendorsLoading} options={vendors?.map((v) => ({ label: v.name, value: v.id }))} />
                </Form.Item>
              </Col>
              <Col xs={12} sm={3}>
                <Form.Item label="SKU Proveedor" name="vendorSku" style={compactItem}>
                  <Input placeholder="SKU Proveedor" />
                </Form.Item>
              </Col>
              <Col xs={12} sm={3}>
                <Form.Item label="Fabricante" name="manufacturer" style={compactItem}>
                  <Input placeholder="Fabricante" />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={12}>
              <Col xs={12} sm={4}>
                <Form.Item label={aiLabel('Ocasion', 'occasionId', aiFilledFields)} name="occasionId" style={{ ...compactItem, ...(aiFilledFields.has('occasionId') ? AI_FILLED_STYLE : {}) }}>
                  <Select placeholder="Seleccionar" allowClear options={refOptions(refData?.['occasions'])} />
                </Form.Item>
              </Col>
              <Col xs={12} sm={4}>
                <Form.Item label="Publico Objetivo" name="targetAudienceId" style={compactItem}>
                  <Select placeholder="Seleccionar" allowClear options={refOptions(refData?.['target-audiences'])} />
                </Form.Item>
              </Col>
              <Col xs={12} sm={4}>
                <Form.Item label="Tipo de Etiqueta" name="labelTypeId" style={compactItem}>
                  <Select placeholder="Seleccionar" allowClear options={refOptions(refData?.['label-types'])} />
                </Form.Item>
              </Col>
            </Row>

            <Divider style={{ margin: '8px 0' }} />

            {/* -- Apariencia, Diseno y Materiales -- */}
            <Typography.Text strong style={{ fontSize: 13 }}>Apariencia, Diseno y Materiales</Typography.Text>

            <Row gutter={12} style={{ marginTop: 8 }}>
              <Col xs={12} sm={3}>
                <Form.Item label={aiLabel('Patron', 'patternId', aiFilledFields)} name="patternId" style={{ ...compactItem, ...(aiFilledFields.has('patternId') ? AI_FILLED_STYLE : {}) }}>
                  <Select placeholder="Seleccionar" allowClear options={refOptions(refData?.['patterns'])} />
                </Form.Item>
              </Col>
              <Col xs={12} sm={3}>
                <Form.Item label={aiLabel('Acabado', 'finishId', aiFilledFields)} name="finishId" style={{ ...compactItem, ...(aiFilledFields.has('finishId') ? AI_FILLED_STYLE : {}) }}>
                  <Select placeholder="Seleccionar" allowClear options={refOptions(refData?.['finishes'])} />
                </Form.Item>
              </Col>
              <Col xs={12} sm={3}>
                <Form.Item label="Accesorio" name="accessoryId" style={compactItem}>
                  <Select placeholder="Seleccionar" allowClear options={refOptions(refData?.['accessories'])} />
                </Form.Item>
              </Col>
              <Col xs={12} sm={3}>
                <Form.Item label={aiLabel('Altura del Tacon', 'heelHeightId', aiFilledFields)} name="heelHeightId" style={{ ...compactItem, ...(aiFilledFields.has('heelHeightId') ? AI_FILLED_STYLE : {}) }}>
                  <Select placeholder="Seleccionar" allowClear options={refOptions(refData?.['heel-heights'])} />
                </Form.Item>
              </Col>
              <Col xs={12} sm={3}>
                <Form.Item label={aiLabel('Forma del Tacon', 'heelShapeId', aiFilledFields)} name="heelShapeId" style={{ ...compactItem, ...(aiFilledFields.has('heelShapeId') ? AI_FILLED_STYLE : {}) }}>
                  <Select placeholder="Seleccionar" allowClear options={refOptions(refData?.['heel-shapes'])} />
                </Form.Item>
              </Col>
              <Col xs={12} sm={3}>
                <Form.Item label={aiLabel('Forma de la Punta', 'toeShapeId', aiFilledFields)} name="toeShapeId" style={{ ...compactItem, ...(aiFilledFields.has('toeShapeId') ? AI_FILLED_STYLE : {}) }}>
                  <Select placeholder="Seleccionar" allowClear options={refOptions(refData?.['toe-shapes'])} />
                </Form.Item>
              </Col>
              <Col xs={12} sm={3}>
                <Form.Item label="Tipo de Zapato" name="closureTypeId" style={compactItem}>
                  <Select placeholder="Seleccionar" allowClear options={refOptions(refData?.['closure-types'])} />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={12}>
              <Col xs={12} sm={4}>
                <Form.Item label={aiLabel('Material Superior', 'upperMaterialId', aiFilledFields)} name="upperMaterialId" style={{ ...compactItem, ...(aiFilledFields.has('upperMaterialId') ? AI_FILLED_STYLE : {}) }}>
                  <Select placeholder="Seleccionar" allowClear showSearch optionFilterProp="label" options={refOptions(refData?.['upper-materials'])} />
                </Form.Item>
              </Col>
              <Col xs={12} sm={4}>
                <Form.Item label="Material de Suela" name="outsoleMaterialId" style={compactItem}>
                  <Select placeholder="Seleccionar" allowClear options={refOptions(refData?.['outsole-materials'])} />
                </Form.Item>
              </Col>
              <Col xs={12} sm={4}>
                <Form.Item label="Material del Tacon" name="heelMaterialId" style={compactItem}>
                  <Select placeholder="Seleccionar" allowClear options={refOptions(refData?.['heel-materials'])} />
                </Form.Item>
              </Col>
              <Col xs={12} sm={5}>
                <Form.Item
                  label="Tipo de Tacon (canonico)"
                  name="heelTypeCode"
                  style={compactItem}
                >
                  <Select
                    placeholder="Codigo canonico"
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    options={(refData?.['heel-types'] ?? []).map((item) => ({
                      value: item.code,
                      label: item.code ? `${item.code} · ${item.name}` : item.name,
                    }))}
                  />
                </Form.Item>
              </Col>
              <Col xs={12} sm={5}>
                <Form.Item
                  label="Material Tacon (canonico)"
                  name="heelMaterialTypeCode"
                  style={compactItem}
                >
                  <Select
                    placeholder="Codigo canonico"
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    options={(refData?.['heel-material-types'] ?? []).map((item) => ({
                      value: item.code,
                      label: item.code ? `${item.code} · ${item.name}` : item.name,
                    }))}
                  />
                </Form.Item>
              </Col>
            </Row>

            <Divider style={{ margin: '8px 0' }} />

            {/* -- Precios y Codigos -- */}
            <Typography.Text strong style={{ fontSize: 13 }}>Precios y Codigos</Typography.Text>

            <Row gutter={12} style={{ marginTop: 8 }}>
              <Col xs={12} sm={4}>
                <Form.Item label="Precio" name="price" rules={[{ required: true, message: 'Precio es requerido' }, { type: 'number', min: 0.01 }]} style={compactItem}>
                  <InputNumber prefix="$" style={{ width: '100%' }} min={0.01} step={0.01} precision={2} placeholder="0.00" />
                </Form.Item>
              </Col>
              <Col xs={12} sm={4}>
                <Form.Item label="Costo" name="cost" style={compactItem}>
                  <InputNumber prefix="$" style={{ width: '100%' }} min={0} step={0.01} precision={2} placeholder="0.00" />
                </Form.Item>
              </Col>
              <Col xs={12} sm={4}>
                <Form.Item label="Codigo de Barras / UPC" name="barcode" style={compactItem}>
                  <Input placeholder="Auto si vacio" />
                </Form.Item>
              </Col>
              <Col xs={12} sm={4}>
                <Form.Item label="Codigo de Temporada" name="season" style={compactItem}>
                  <Input placeholder="ej. SS26" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8}>
                <Form.Item label="Palabras Clave" name="keywords" rules={[{ max: 500 }]} style={compactItem}>
                  <Input placeholder="Palabras clave (separadas por coma)" />
                </Form.Item>
              </Col>
            </Row>

            <Divider style={{ margin: '8px 0' }} />

            <Form.Item style={{ marginBottom: 0 }}>
              <Space>
                <Button
                  type="primary"
                  htmlType="submit"
                  icon={<SaveOutlined />}
                  loading={isSaving}
                >
                  {isEdit ? 'Actualizar SKU' : 'Crear SKU'}
                </Button>
                <Button onClick={() => navigate('/inventory/skus')}>
                  Cancelar
                </Button>
              </Space>
            </Form.Item>
          </Form>
        </Card>
      </div>
    </>
  )
}

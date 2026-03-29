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
import { useSku, useCreateSku, useUpdateSku, useVendors, useAnalyzeImage, useReferenceData, useLookupSku, useSearchSkus } from '../../hooks/useSkus'
import { fetchSizeLabels } from '../../services/skuApi'
import type { Department, SkuCreatePayload, ReferenceItem, ImageAnalysisResult, EnhancedAnalysisResult, AiFillSummary, SizeLabelItem } from '../../types/sku'

const DEPARTMENTS: Department[] = ['FORMAL', 'CASUAL', 'FIESTA', 'SANDALIAS', 'BOOTS', 'COMFORT']

/** Mapping: AI response key → form field name + reference table slug */
const AI_FIELD_MAP: { aiKey: keyof ImageAnalysisResult; formField: string; type: 'text' | 'enum' | 'reference'; refTable?: string }[] = [
  { aiKey: 'description', formField: 'webDescription', type: 'text' },
  { aiKey: 'department', formField: 'department', type: 'enum' },
  { aiKey: 'color', formField: 'colorId', type: 'reference', refTable: 'colors' },
  { aiKey: 'shoe_type', formField: 'shoeTypeId', type: 'reference', refTable: 'shoe-types' },
  { aiKey: 'heel_height', formField: 'heelHeightId', type: 'reference', refTable: 'heel-heights' },
  { aiKey: 'heel_shape', formField: 'heelShapeId', type: 'reference', refTable: 'heel-shapes' },
  { aiKey: 'toe_shape', formField: 'toeShapeId', type: 'reference', refTable: 'toe-shapes' },
  { aiKey: 'upper_material', formField: 'upperMaterialId', type: 'reference', refTable: 'upper-materials' },
  { aiKey: 'finish', formField: 'finishId', type: 'reference', refTable: 'finishes' },
  { aiKey: 'pattern', formField: 'patternId', type: 'reference', refTable: 'patterns' },
  { aiKey: 'occasion', formField: 'occasionId', type: 'reference', refTable: 'occasions' },
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
  const [aiPanelOpen, setAiPanelOpen] = useState(false)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [analysisResult, setAnalysisResult] = useState<EnhancedAnalysisResult | null>(null)
  const [aiFilledFields, setAiFilledFields] = useState<Set<string>>(new Set())
  const [aiFillSummary, setAiFillSummary] = useState<AiFillSummary | null>(null)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [lastUploadedFile, setLastUploadedFile] = useState<File | null>(null)
  const [sizeLabels, setSizeLabels] = useState<SizeLabelItem[]>([])

  // Inline lookup state: tracks when a user-entered SKU code matches an existing SKU
  const [matchedSku, setMatchedSku] = useState<import('../../types/sku').Sku | null>(null)
  const isEdit = isRouteEdit || !!matchedSku

  // SKU search-as-you-type state
  const [skuSearchText, setSkuSearchText] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current) }
  }, [])
  const { data: searchResults, isFetching: isSearching } = useSearchSkus(debouncedSearch)

  const skuSearchOptions = useMemo(() => {
    if (!searchResults?.length) return []
    return searchResults.map((s) => ({
      value: s.skuCode,
      label: (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ fontWeight: 500 }}>{s.skuCode}</span>
          <span style={{ color: '#888', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {s.style} · {s.department}
          </span>
        </div>
      ),
    }))
  }, [searchResults])

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
        const dept = DEPARTMENTS.find((d) => d.toLowerCase() === aiValue.toLowerCase())
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
          fieldsToSet[mapping.formField] = matchedId
          filled.push(mapping.formField)
        } else {
          skipped.push(mapping.formField)
        }
      }
    }

    form.setFieldsValue(fieldsToSet)
    setAiFilledFields(new Set(filled))
    setAiFillSummary({ filled, skipped, total: AI_FIELD_MAP.length })
  }, [refData, form])

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
      sizeTypeId: s.sizeTypeId,
      labelTypeId: s.labelTypeId,
      sizes: s.sizes?.map((sz) => sz.sizeLabel) ?? [],
    })
    // Load size labels if sizeType is set
    if (s.sizeTypeId) {
      fetchSizeLabels(s.sizeTypeId).then(setSizeLabels).catch(() => {})
    }
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
        message.info(`Existing SKU found: ${found.skuCode} — switched to update mode`)
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
    message.info('Switched back to create mode')
  }, [form, message])

  const handleSubmit = async (values: SkuCreatePayload) => {
    try {
      const editId = skuId ?? matchedSku?.id
      if (editId) {
        // Update mode: either from route param or inline lookup match
        const { skuCode: _omit, ...updateValues } = values as SkuCreatePayload & { skuCode?: string }
        await updateMutation.mutateAsync({ skuId: editId, payload: updateValues })
        message.success('SKU updated successfully')
      } else {
        await createMutation.mutateAsync(values)
        message.success('SKU created successfully')
      }
      navigate('/inventory/skus')
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'An error occurred'
      if (errMsg.toLowerCase().includes('duplicate barcode') || errMsg.includes('409')) {
        form.setFields([{ name: 'barcode', errors: ['This barcode is already in use'] }])
      } else {
        message.error(errMsg)
      }
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
      message.success('Image analyzed! Click "Fill with AI" to auto-populate fields.')
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Image analysis failed'
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
      message.success(`AI filled ${summary.filled.length} of ${summary.total} fields.`)
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

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
        <Spin size="large" tip="Loading reference data..." />
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
                  Back
                </Button>
                <Typography.Title level={4} style={{ margin: 0 }}>
                  {isEdit ? 'Edit SKU' : 'New SKU'}
                </Typography.Title>
                {isRouteEdit && sku && (
                  <Tag color="blue">{sku.skuCode}</Tag>
                )}
                {!isRouteEdit && matchedSku && (
                  <Space size={4}>
                    <Tag color="orange">Existing: {matchedSku.skuCode}</Tag>
                    <Button size="small" type="link" onClick={handleResetToCreate}>
                      Create new instead
                    </Button>
                  </Space>
                )}
              </Space>
            </Col>
            {!isRouteEdit && (
              <Col>
                <Switch
                  checked={aiPanelOpen}
                  onChange={setAiPanelOpen}
                  checkedChildren={<><CameraOutlined /> AI</>}
                  unCheckedChildren={<><EyeInvisibleOutlined /> AI</>}
                  style={{ minWidth: 60 }}
                />
              </Col>
            )}
          </Row>
        </Card>

        {/* AI Image Analysis — collapsible */}
        {!isRouteEdit && aiPanelOpen && (
          <Card size="small" bodyStyle={{ padding: '8px 16px' }}>
            <Row align="middle" justify="space-between">
              <Col>
                <Typography.Text strong style={{ fontSize: 13 }}><CameraOutlined /> AI Image Analysis</Typography.Text>
                <Typography.Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                  Drop a shoe photo, then fill attributes with AI
                </Typography.Text>
              </Col>
              <Col>
                <Tooltip title={!analysisResult && !analyzeMutation.isPending ? (analysisError ? 'Analysis failed — see error below' : 'Upload an image first') : undefined}>
                  <Button
                    type="primary"
                    icon={<ThunderboltOutlined />}
                    onClick={handleFillWithAi}
                    disabled={!analysisResult || analyzeMutation.isPending}
                    style={{ fontWeight: 600 }}
                  >
                    Fill with AI
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
                      <p style={{ marginTop: 4, marginBottom: 0, fontSize: 12 }}>Analyzing...</p>
                    </div>
                  ) : (
                    <div>
                      <CameraOutlined style={{ fontSize: 20, color: '#999' }} />
                      <p style={{ marginTop: 4, marginBottom: 0, fontSize: 12 }}>Click or drag shoe image</p>
                    </div>
                  )}
                </Upload.Dragger>
              </Col>
              {imagePreview && (
                <Col xs={24} sm={12}>
                  <img
                    src={imagePreview}
                    alt="Uploaded shoe"
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
                message="Image analysis failed"
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
                        Retry
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
                message="Image analyzed — ready to fill"
                description={
                  <div style={{ fontSize: 12 }}>
                    {analysisResult.raw.shoe_type && <span><strong>Type:</strong> {analysisResult.raw.shoe_type} | </span>}
                    {analysisResult.raw.heel_height && <span><strong>Heel:</strong> {analysisResult.raw.heel_height} | </span>}
                    {analysisResult.raw.upper_material && <span><strong>Material:</strong> {analysisResult.raw.upper_material} | </span>}
                    {analysisResult.raw.color_family && <span><strong>Color:</strong> {analysisResult.raw.color_family} | </span>}
                    {analysisResult.raw.occasion && <span><strong>Occasion:</strong> {analysisResult.raw.occasion}</span>}
                    <br />
                    <Typography.Text type="secondary">Click "Fill with AI" to populate form fields.</Typography.Text>
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
                message={`AI filled ${aiFillSummary.filled.length} of ${aiFillSummary.total} fields`}
                description={
                  <div style={{ fontSize: 12 }}>
                    {aiFillSummary.filled.length > 0 && (
                      <div>
                        <strong>Filled:</strong>{' '}
                        {aiFillSummary.filled.map((f) => (
                          <Tag key={f} color="green" style={{ marginBottom: 2 }}>{f}</Tag>
                        ))}
                      </div>
                    )}
                    {aiFillSummary.skipped.length > 0 && (
                      <div style={{ marginTop: 4 }}>
                        <strong>Not determined:</strong>{' '}
                        {aiFillSummary.skipped.map((f) => (
                          <Tag key={f} style={{ marginBottom: 2 }}>{f}</Tag>
                        ))}
                      </div>
                    )}
                    <Typography.Text type="secondary" style={{ display: 'block', marginTop: 4 }}>
                      All AI-filled values are editable — adjust as needed.
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
            {/* ── SKU Code ── */}
            {!isRouteEdit && (
              <>
                <Typography.Text strong style={{ fontSize: 13 }}>SKU Code</Typography.Text>
                <Row gutter={12} style={{ marginTop: 8 }}>
                  <Col xs={24} sm={8}>
                    <Form.Item
                      label="SKU Code"
                      name="skuCode"
                      style={compactItem}
                      extra={matchedSku ? undefined : 'Leave blank to auto-generate, or type to search existing SKUs'}
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
                        placeholder="e.g. FORMAL-NIKE-BLK-9.5-001"
                        disabled={!!matchedSku}
                        popupMatchSelectWidth={400}
                        notFoundContent={isSearching ? <Spin size="small" /> : (skuSearchText.length >= 1 ? 'No matching SKUs' : null)}
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

            {/* ── Product Details ── */}
            <Typography.Text strong style={{ fontSize: 13 }}>Product Details</Typography.Text>

            <Row gutter={12} style={{ marginTop: 8 }}>
              <Col xs={12} sm={4}>
                <Form.Item label="Brand" name="brandId" style={compactItem}>
                  <Select placeholder="Select" allowClear showSearch optionFilterProp="label" options={refOptions(refData?.['brands'])} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={4}>
                <Form.Item label="Style" name="style" rules={[{ required: true }, { max: 100 }]} style={compactItem}>
                  <Input placeholder="e.g. Oxford" />
                </Form.Item>
              </Col>
              <Col xs={12} sm={3}>
                <Form.Item label={aiLabel('Color', 'colorId', aiFilledFields)} name="colorId" style={{ ...compactItem, ...(aiFilledFields.has('colorId') ? AI_FILLED_STYLE : {}) }}>
                  <Select placeholder="Select" allowClear showSearch optionFilterProp="label" options={refOptions(refData?.['colors'])} />
                </Form.Item>
              </Col>
              <Col xs={12} sm={3}>
                <Form.Item label="Size Type" name="sizeTypeId" style={compactItem}>
                  <Select placeholder="Select" allowClear options={refOptions(refData?.['size-types'])} onChange={(val: number | null) => {
                    if (val) {
                      fetchSizeLabels(val).then(setSizeLabels).catch(() => setSizeLabels([]))
                    } else {
                      setSizeLabels([])
                      form.setFieldsValue({ sizes: [] })
                    }
                  }} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={6}>
                <Form.Item label="Sizes" name="sizes" style={compactItem}>
                  <Select mode="multiple" placeholder={sizeLabels.length ? 'Select sizes' : 'Choose size type first'} disabled={!sizeLabels.length} options={sizeLabels.map((sl) => ({ label: sl.label, value: sl.label }))} />
                </Form.Item>
              </Col>
              <Col xs={12} sm={3}>
                <Form.Item label="Width" name="widthTypeId" style={compactItem}>
                  <Select placeholder="Select" allowClear options={refOptions(refData?.['width-types'])} />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={12}>
              <Col xs={12} sm={4}>
                <Form.Item label={aiLabel('Shoe Type', 'shoeTypeId', aiFilledFields)} name="shoeTypeId" style={{ ...compactItem, ...(aiFilledFields.has('shoeTypeId') ? AI_FILLED_STYLE : {}) }}>
                  <Select placeholder="Select" allowClear showSearch optionFilterProp="label" options={refOptions(refData?.['shoe-types'])} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={10}>
                <Form.Item label={aiLabel('Web Description', 'webDescription', aiFilledFields)} name="webDescription" rules={[{ max: 1000 }]} style={{ ...compactItem, ...(aiFilledFields.has('webDescription') ? AI_FILLED_STYLE : {}) }}>
                  <Input.TextArea rows={1} placeholder="Descripcion en espanol" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={10}>
                <Form.Item label="RICS Description" name="ricsDescription" rules={[{ max: 500 }]} style={compactItem}>
                  <Input placeholder="Auto-generated if blank" />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={12}>
              <Col xs={24} sm={12}>
                <Form.Item label="Comment" name="comment" rules={[{ max: 1000 }]} style={compactItem}>
                  <Input.TextArea rows={1} placeholder="Internal notes" />
                </Form.Item>
              </Col>
            </Row>

            <Divider style={{ margin: '8px 0' }} />

            {/* ── Classification & Vendor ── */}
            <Typography.Text strong style={{ fontSize: 13 }}>Classification & Vendor</Typography.Text>

            <Row gutter={12} style={{ marginTop: 8 }}>
              <Col xs={12} sm={4}>
                <Form.Item label={aiLabel('Department', 'department', aiFilledFields)} name="department" rules={[{ required: true }]} style={{ ...compactItem, ...(aiFilledFields.has('department') ? AI_FILLED_STYLE : {}) }}>
                  <Select placeholder="Select" options={DEPARTMENTS.map((d) => ({ label: d, value: d }))} />
                </Form.Item>
              </Col>
              <Col xs={12} sm={4}>
                <Form.Item label="Category" name="categoryId" style={compactItem}>
                  <Select placeholder="Select" allowClear showSearch optionFilterProp="label">
                    {(() => {
                      const cats = (refData?.['categories'] ?? []) as { id: number; ricsCode?: number; name: string; deptMacro?: string }[]
                      const grouped = cats.reduce<Record<string, typeof cats>>((acc, c) => {
                        const group = c.deptMacro || 'Other'
                        if (!acc[group]) acc[group] = []
                        acc[group].push(c)
                        return acc
                      }, {})
                      return Object.entries(grouped).map(([macro, items]) => (
                        <Select.OptGroup key={macro} label={macro}>
                          {items.map((c) => (
                            <Select.Option key={c.id} value={c.id} label={`${c.ricsCode ?? ''} ${c.name}`}>
                              {c.ricsCode ?? ''} {c.name}
                            </Select.Option>
                          ))}
                        </Select.OptGroup>
                      ))
                    })()}
                  </Select>
                </Form.Item>
              </Col>
              <Col xs={12} sm={3}>
                <Form.Item label="Season" name="seasonId" style={compactItem}>
                  <Select placeholder="Select" allowClear options={refOptions(refData?.['seasons'])} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={4}>
                <Form.Item label="Vendor" name="vendorId" rules={[{ required: true }]} style={compactItem}>
                  <Select placeholder="Search..." showSearch optionFilterProp="label" loading={vendorsLoading} options={vendors?.map((v) => ({ label: v.name, value: v.id }))} />
                </Form.Item>
              </Col>
              <Col xs={12} sm={3}>
                <Form.Item label="Vendor SKU" name="vendorSku" style={compactItem}>
                  <Input placeholder="Vendor SKU" />
                </Form.Item>
              </Col>
              <Col xs={12} sm={3}>
                <Form.Item label="Manufacturer" name="manufacturer" style={compactItem}>
                  <Input placeholder="Manufacturer" />
                </Form.Item>
              </Col>
              <Col xs={12} sm={4}>
                <Form.Item label={aiLabel('Occasion', 'occasionId', aiFilledFields)} name="occasionId" style={{ ...compactItem, ...(aiFilledFields.has('occasionId') ? AI_FILLED_STYLE : {}) }}>
                  <Select placeholder="Select" allowClear options={refOptions(refData?.['occasions'])} />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={12}>
              <Col xs={12} sm={4}>
                <Form.Item label="Target Audience" name="targetAudienceId" style={compactItem}>
                  <Select placeholder="Select" allowClear options={refOptions(refData?.['target-audiences'])} />
                </Form.Item>
              </Col>
              <Col xs={12} sm={4}>
                <Form.Item label="Label Type" name="labelTypeId" style={compactItem}>
                  <Select placeholder="Select" allowClear options={refOptions(refData?.['label-types'])} />
                </Form.Item>
              </Col>
            </Row>

            <Divider style={{ margin: '8px 0' }} />

            {/* ── Appearance, Design & Materials ── */}
            <Typography.Text strong style={{ fontSize: 13 }}>Appearance, Design & Materials</Typography.Text>

            <Row gutter={12} style={{ marginTop: 8 }}>
              <Col xs={12} sm={3}>
                <Form.Item label={aiLabel('Pattern', 'patternId', aiFilledFields)} name="patternId" style={{ ...compactItem, ...(aiFilledFields.has('patternId') ? AI_FILLED_STYLE : {}) }}>
                  <Select placeholder="Select" allowClear options={refOptions(refData?.['patterns'])} />
                </Form.Item>
              </Col>
              <Col xs={12} sm={3}>
                <Form.Item label={aiLabel('Finish', 'finishId', aiFilledFields)} name="finishId" style={{ ...compactItem, ...(aiFilledFields.has('finishId') ? AI_FILLED_STYLE : {}) }}>
                  <Select placeholder="Select" allowClear options={refOptions(refData?.['finishes'])} />
                </Form.Item>
              </Col>
              <Col xs={12} sm={3}>
                <Form.Item label="Accessory" name="accessoryId" style={compactItem}>
                  <Select placeholder="Select" allowClear options={refOptions(refData?.['accessories'])} />
                </Form.Item>
              </Col>
              <Col xs={12} sm={3}>
                <Form.Item label={aiLabel('Heel Height', 'heelHeightId', aiFilledFields)} name="heelHeightId" style={{ ...compactItem, ...(aiFilledFields.has('heelHeightId') ? AI_FILLED_STYLE : {}) }}>
                  <Select placeholder="Select" allowClear options={refOptions(refData?.['heel-heights'])} />
                </Form.Item>
              </Col>
              <Col xs={12} sm={3}>
                <Form.Item label={aiLabel('Heel Shape', 'heelShapeId', aiFilledFields)} name="heelShapeId" style={{ ...compactItem, ...(aiFilledFields.has('heelShapeId') ? AI_FILLED_STYLE : {}) }}>
                  <Select placeholder="Select" allowClear options={refOptions(refData?.['heel-shapes'])} />
                </Form.Item>
              </Col>
              <Col xs={12} sm={3}>
                <Form.Item label={aiLabel('Toe Shape', 'toeShapeId', aiFilledFields)} name="toeShapeId" style={{ ...compactItem, ...(aiFilledFields.has('toeShapeId') ? AI_FILLED_STYLE : {}) }}>
                  <Select placeholder="Select" allowClear options={refOptions(refData?.['toe-shapes'])} />
                </Form.Item>
              </Col>
              <Col xs={12} sm={3}>
                <Form.Item label="Closure Type" name="closureTypeId" style={compactItem}>
                  <Select placeholder="Select" allowClear options={refOptions(refData?.['closure-types'])} />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={12}>
              <Col xs={12} sm={4}>
                <Form.Item label={aiLabel('Upper Material', 'upperMaterialId', aiFilledFields)} name="upperMaterialId" style={{ ...compactItem, ...(aiFilledFields.has('upperMaterialId') ? AI_FILLED_STYLE : {}) }}>
                  <Select placeholder="Select" allowClear showSearch optionFilterProp="label" options={refOptions(refData?.['upper-materials'])} />
                </Form.Item>
              </Col>
              <Col xs={12} sm={4}>
                <Form.Item label="Outsole Material" name="outsoleMaterialId" style={compactItem}>
                  <Select placeholder="Select" allowClear options={refOptions(refData?.['outsole-materials'])} />
                </Form.Item>
              </Col>
              <Col xs={12} sm={4}>
                <Form.Item label="Heel Material" name="heelMaterialId" style={compactItem}>
                  <Select placeholder="Select" allowClear options={refOptions(refData?.['heel-materials'])} />
                </Form.Item>
              </Col>
            </Row>

            <Divider style={{ margin: '8px 0' }} />

            {/* ── Pricing & Codes ── */}
            <Typography.Text strong style={{ fontSize: 13 }}>Pricing & Codes</Typography.Text>

            <Row gutter={12} style={{ marginTop: 8 }}>
              <Col xs={12} sm={4}>
                <Form.Item label="Retail Price" name="price" rules={[{ required: true }, { type: 'number', min: 0.01 }]} style={compactItem}>
                  <InputNumber prefix="$" style={{ width: '100%' }} min={0.01} step={0.01} precision={2} placeholder="0.00" />
                </Form.Item>
              </Col>
              <Col xs={12} sm={4}>
                <Form.Item label="Cost" name="cost" style={compactItem}>
                  <InputNumber prefix="$" style={{ width: '100%' }} min={0} step={0.01} precision={2} placeholder="0.00" />
                </Form.Item>
              </Col>
              <Col xs={12} sm={4}>
                <Form.Item label="Barcode / UPC" name="barcode" style={compactItem}>
                  <Input placeholder="Auto if blank" />
                </Form.Item>
              </Col>
              <Col xs={12} sm={4}>
                <Form.Item label="Season Code" name="season" style={compactItem}>
                  <Input placeholder="e.g. SS26" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8}>
                <Form.Item label="Keywords" name="keywords" rules={[{ max: 500 }]} style={compactItem}>
                  <Input placeholder="Search keywords (comma-separated)" />
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
                  {isEdit ? 'Update SKU' : 'Create SKU'}
                </Button>
                <Button onClick={() => navigate('/inventory/skus')}>
                  Cancel
                </Button>
              </Space>
            </Form.Item>
          </Form>
        </Card>
      </div>
    </>
  )
}

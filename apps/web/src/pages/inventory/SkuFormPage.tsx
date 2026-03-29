import { useState, useEffect, useCallback } from 'react'
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
} from 'antd'
import { ArrowLeftOutlined, SaveOutlined, CameraOutlined, LoadingOutlined, SearchOutlined, ThunderboltOutlined, CheckCircleOutlined, ExclamationCircleOutlined, ReloadOutlined } from '@ant-design/icons'
import { useSku, useCreateSku, useUpdateSku, useVendors, useAnalyzeImage, useReferenceData, useLookupSku } from '../../hooks/useSkus'
import type { Department, SkuCreatePayload, ReferenceItem, ImageAnalysisResult, EnhancedAnalysisResult, AiFillSummary } from '../../types/sku'

const DEPARTMENTS: Department[] = ['FORMAL', 'CASUAL', 'FIESTA', 'SANDALIAS', 'BOOTS', 'COMFORT']

/** Mapping: AI response key → form field name + reference table slug */
const AI_FIELD_MAP: { aiKey: keyof ImageAnalysisResult; formField: string; type: 'text' | 'enum' | 'reference'; refTable?: string }[] = [
  { aiKey: 'color', formField: 'color', type: 'text' },
  { aiKey: 'description', formField: 'description', type: 'text' },
  { aiKey: 'department', formField: 'department', type: 'enum' },
  { aiKey: 'shoe_type', formField: 'shoeTypeId', type: 'reference', refTable: 'shoe-types' },
  { aiKey: 'heel_height', formField: 'heelHeightId', type: 'reference', refTable: 'heel-heights' },
  { aiKey: 'heel_shape', formField: 'heelShapeId', type: 'reference', refTable: 'heel-shapes' },
  { aiKey: 'toe_shape', formField: 'toeShapeId', type: 'reference', refTable: 'toe-shapes' },
  { aiKey: 'color_family', formField: 'colorFamilyId', type: 'reference', refTable: 'color-families' },
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

  const isEdit = !!skuId
  const { data: sku, isLoading: skuLoading } = useSku(skuId)
  const { data: vendors, isLoading: vendorsLoading } = useVendors()
  const { data: refData, isLoading: refLoading } = useReferenceData()
  const createMutation = useCreateSku()
  const updateMutation = useUpdateSku()
  const analyzeMutation = useAnalyzeImage()
  const lookupMutation = useLookupSku()
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [lookupCode, setLookupCode] = useState('')
  const [analysisResult, setAnalysisResult] = useState<EnhancedAnalysisResult | null>(null)
  const [aiFilledFields, setAiFilledFields] = useState<Set<string>>(new Set())
  const [aiFillSummary, setAiFillSummary] = useState<AiFillSummary | null>(null)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [lastUploadedFile, setLastUploadedFile] = useState<File | null>(null)

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

  useEffect(() => {
    if (sku) {
      form.setFieldsValue({
        brand: sku.brand,
        style: sku.style,
        color: sku.color,
        size: sku.size,
        price: sku.price,
        cost: sku.cost,
        category: sku.category,
        department: sku.department,
        vendorId: sku.vendorId,
        vendorSku: sku.vendorSku,
        barcode: sku.barcode,
        description: sku.description,
        comment: sku.comment,
        keywords: sku.keywords,
        season: sku.season,
        manufacturer: sku.manufacturer,
        colorFamilyId: sku.colorFamilyId,
        shoeTypeId: sku.shoeTypeId,
        heelShapeId: sku.heelShapeId,
        heelHeightId: sku.heelHeightId,
        toeShapeId: sku.toeShapeId,
        closureTypeId: sku.closureTypeId,
        upperMaterialId: sku.upperMaterialId,
        outsoleMaterialId: sku.outsoleMaterialId,
        finishId: sku.finishId,
        widthTypeId: sku.widthTypeId,
        patternId: sku.patternId,
        occasionId: sku.occasionId,
        targetAudienceId: sku.targetAudienceId,
        accessoryId: sku.accessoryId,
        seasonId: sku.seasonId,
        sizeTypeId: sku.sizeTypeId,
        labelTypeId: sku.labelTypeId,
      })
    }
  }, [sku, form])

  const handleSubmit = async (values: SkuCreatePayload) => {
    try {
      if (isEdit) {
        await updateMutation.mutateAsync({ skuId: skuId!, payload: values })
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

  const handleLookup = async () => {
    if (!lookupCode.trim()) return
    try {
      const found = await lookupMutation.mutateAsync(lookupCode.trim())
      if (found) {
        message.info(`SKU found: ${found.skuCode} — ${found.brand} ${found.style}`)
        navigate(`/inventory/skus/${found.id}/edit`)
      } else {
        message.warning('No SKU found with that code. You can create a new one.')
      }
    } catch {
      message.error('Lookup failed')
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  if (isEdit && skuLoading) {
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

  return (
    <App>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        {/* Header */}
        <Card size="small">
          <Row align="middle" justify="space-between">
            <Col>
              <Space>
                <Button
                  icon={<ArrowLeftOutlined />}
                  onClick={() => navigate('/inventory/skus')}
                >
                  Back
                </Button>
                <Typography.Title level={4} style={{ margin: 0 }}>
                  {isEdit ? 'Edit SKU' : 'New SKU'}
                </Typography.Title>
                {isEdit && sku && (
                  <Tag color="blue">{sku.skuCode}</Tag>
                )}
              </Space>
            </Col>
          </Row>
        </Card>

        {/* SKU Lookup */}
        {!isEdit && (
          <Card size="small">
            <Typography.Text strong>SKU Lookup</Typography.Text>
            <Typography.Text type="secondary" style={{ marginLeft: 8 }}>
              Check if a SKU already exists before creating
            </Typography.Text>
            <Row gutter={8} style={{ marginTop: 8 }}>
              <Col flex="auto">
                <Input
                  placeholder="Enter SKU code to search..."
                  value={lookupCode}
                  onChange={(e) => setLookupCode(e.target.value)}
                  onPressEnter={handleLookup}
                />
              </Col>
              <Col>
                <Button
                  icon={<SearchOutlined />}
                  onClick={handleLookup}
                  loading={lookupMutation.isPending}
                >
                  Lookup
                </Button>
              </Col>
            </Row>
          </Card>
        )}

        {/* AI Image Analysis */}
        {!isEdit && (
          <Card size="small">
            <Row align="middle" justify="space-between">
              <Col>
                <Typography.Text strong><CameraOutlined /> AI Image Analysis</Typography.Text>
                <Typography.Text type="secondary" style={{ marginLeft: 8 }}>
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
                    size="large"
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
                  style={{ padding: '12px 0' }}
                >
                  {analyzeMutation.isPending ? (
                    <div>
                      <LoadingOutlined style={{ fontSize: 24, color: '#1677ff' }} />
                      <p style={{ marginTop: 4, marginBottom: 0 }}>Analyzing...</p>
                    </div>
                  ) : (
                    <div>
                      <CameraOutlined style={{ fontSize: 24, color: '#999' }} />
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
                    style={{ width: '100%', maxHeight: 150, objectFit: 'contain', borderRadius: 8, border: '1px solid #d9d9d9' }}
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

        {/* Main Form */}
        <Card>
          <Form
            form={form}
            layout="vertical"
            onFinish={handleSubmit}
            requiredMark="optional"
          >
            {/* ── Product Details ── */}
            <Typography.Title level={5}>Product Details</Typography.Title>

            <Row gutter={16}>
              <Col xs={24} sm={8}>
                <Form.Item label="Brand" name="brand" rules={[{ required: true }, { max: 100 }]}>
                  <Input placeholder="e.g. Nike" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8}>
                <Form.Item label="Style" name="style" rules={[{ required: true }, { max: 100 }]}>
                  <Input placeholder="e.g. Oxford" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8}>
                <Form.Item label={aiLabel('Color', 'color', aiFilledFields)} name="color" rules={[{ required: true }, { max: 50 }]} style={aiFilledFields.has('color') ? AI_FILLED_STYLE : undefined}>
                  <Input placeholder="e.g. Black" />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col xs={12} sm={6}>
                <Form.Item label="Size" name="size" rules={[{ required: true }]}>
                  <Input placeholder="9.5" />
                </Form.Item>
              </Col>
              <Col xs={12} sm={6}>
                <Form.Item label="Size Type" name="sizeTypeId">
                  <Select placeholder="Select" allowClear options={refOptions(refData?.['size-types'])} />
                </Form.Item>
              </Col>
              <Col xs={12} sm={6}>
                <Form.Item label="Width" name="widthTypeId">
                  <Select placeholder="Select" allowClear options={refOptions(refData?.['width-types'])} />
                </Form.Item>
              </Col>
              <Col xs={12} sm={6}>
                <Form.Item label={aiLabel('Shoe Type', 'shoeTypeId', aiFilledFields)} name="shoeTypeId" style={aiFilledFields.has('shoeTypeId') ? AI_FILLED_STYLE : undefined}>
                  <Select placeholder="Select" allowClear showSearch optionFilterProp="label" options={refOptions(refData?.['shoe-types'])} />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col xs={24} sm={12}>
                <Form.Item label={aiLabel('Description', 'description', aiFilledFields)} name="description" rules={[{ max: 500 }]} style={aiFilledFields.has('description') ? AI_FILLED_STYLE : undefined}>
                  <Input.TextArea rows={2} placeholder="Product description" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item label="Comment" name="comment" rules={[{ max: 1000 }]}>
                  <Input.TextArea rows={2} placeholder="Internal notes" />
                </Form.Item>
              </Col>
            </Row>

            <Divider />

            {/* ── Classification & Vendor ── */}
            <Typography.Title level={5}>Classification & Vendor</Typography.Title>

            <Row gutter={16}>
              <Col xs={24} sm={8}>
                <Form.Item label={aiLabel('Department', 'department', aiFilledFields)} name="department" rules={[{ required: true }]} style={aiFilledFields.has('department') ? AI_FILLED_STYLE : undefined}>
                  <Select placeholder="Select" options={DEPARTMENTS.map((d) => ({ label: d, value: d }))} />
                </Form.Item>
              </Col>
              <Col xs={12} sm={8}>
                <Form.Item label="Category" name="category" rules={[{ required: true }, { type: 'number', min: 556, max: 599 }]}>
                  <InputNumber style={{ width: '100%' }} min={556} max={599} precision={0} placeholder="556-599" />
                </Form.Item>
              </Col>
              <Col xs={12} sm={8}>
                <Form.Item label="Season" name="seasonId">
                  <Select placeholder="Select" allowClear options={refOptions(refData?.['seasons'])} />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col xs={24} sm={8}>
                <Form.Item label="Vendor" name="vendorId" rules={[{ required: true }]}>
                  <Select placeholder="Search vendors..." showSearch optionFilterProp="label" loading={vendorsLoading} options={vendors?.map((v) => ({ label: v.name, value: v.id }))} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8}>
                <Form.Item label="Vendor SKU" name="vendorSku">
                  <Input placeholder="Vendor's own SKU" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8}>
                <Form.Item label="Manufacturer" name="manufacturer">
                  <Input placeholder="Manufacturer name" />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col xs={24} sm={8}>
                <Form.Item label={aiLabel('Occasion', 'occasionId', aiFilledFields)} name="occasionId" style={aiFilledFields.has('occasionId') ? AI_FILLED_STYLE : undefined}>
                  <Select placeholder="Select" allowClear options={refOptions(refData?.['occasions'])} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8}>
                <Form.Item label="Target Audience" name="targetAudienceId">
                  <Select placeholder="Select" allowClear options={refOptions(refData?.['target-audiences'])} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8}>
                <Form.Item label="Label Type" name="labelTypeId">
                  <Select placeholder="Select" allowClear options={refOptions(refData?.['label-types'])} />
                </Form.Item>
              </Col>
            </Row>

            <Divider />

            {/* ── Appearance & Design ── */}
            <Typography.Title level={5}>Appearance & Design</Typography.Title>

            <Row gutter={16}>
              <Col xs={12} sm={6}>
                <Form.Item label={aiLabel('Color Family', 'colorFamilyId', aiFilledFields)} name="colorFamilyId" style={aiFilledFields.has('colorFamilyId') ? AI_FILLED_STYLE : undefined}>
                  <Select placeholder="Select" allowClear showSearch optionFilterProp="label" options={refOptions(refData?.['color-families'])} />
                </Form.Item>
              </Col>
              <Col xs={12} sm={6}>
                <Form.Item label={aiLabel('Pattern', 'patternId', aiFilledFields)} name="patternId" style={aiFilledFields.has('patternId') ? AI_FILLED_STYLE : undefined}>
                  <Select placeholder="Select" allowClear options={refOptions(refData?.['patterns'])} />
                </Form.Item>
              </Col>
              <Col xs={12} sm={6}>
                <Form.Item label={aiLabel('Finish', 'finishId', aiFilledFields)} name="finishId" style={aiFilledFields.has('finishId') ? AI_FILLED_STYLE : undefined}>
                  <Select placeholder="Select" allowClear options={refOptions(refData?.['finishes'])} />
                </Form.Item>
              </Col>
              <Col xs={12} sm={6}>
                <Form.Item label="Accessory" name="accessoryId">
                  <Select placeholder="Select" allowClear options={refOptions(refData?.['accessories'])} />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col xs={12} sm={6}>
                <Form.Item label={aiLabel('Heel Height', 'heelHeightId', aiFilledFields)} name="heelHeightId" style={aiFilledFields.has('heelHeightId') ? AI_FILLED_STYLE : undefined}>
                  <Select placeholder="Select" allowClear options={refOptions(refData?.['heel-heights'])} />
                </Form.Item>
              </Col>
              <Col xs={12} sm={6}>
                <Form.Item label={aiLabel('Heel Shape', 'heelShapeId', aiFilledFields)} name="heelShapeId" style={aiFilledFields.has('heelShapeId') ? AI_FILLED_STYLE : undefined}>
                  <Select placeholder="Select" allowClear options={refOptions(refData?.['heel-shapes'])} />
                </Form.Item>
              </Col>
              <Col xs={12} sm={6}>
                <Form.Item label={aiLabel('Toe Shape', 'toeShapeId', aiFilledFields)} name="toeShapeId" style={aiFilledFields.has('toeShapeId') ? AI_FILLED_STYLE : undefined}>
                  <Select placeholder="Select" allowClear options={refOptions(refData?.['toe-shapes'])} />
                </Form.Item>
              </Col>
              <Col xs={12} sm={6}>
                <Form.Item label="Closure Type" name="closureTypeId">
                  <Select placeholder="Select" allowClear options={refOptions(refData?.['closure-types'])} />
                </Form.Item>
              </Col>
            </Row>

            <Divider />

            {/* ── Materials ── */}
            <Typography.Title level={5}>Materials</Typography.Title>

            <Row gutter={16}>
              <Col xs={24} sm={8}>
                <Form.Item label={aiLabel('Upper Material', 'upperMaterialId', aiFilledFields)} name="upperMaterialId" style={aiFilledFields.has('upperMaterialId') ? AI_FILLED_STYLE : undefined}>
                  <Select placeholder="Select" allowClear showSearch optionFilterProp="label" options={refOptions(refData?.['upper-materials'])} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8}>
                <Form.Item label="Outsole Material" name="outsoleMaterialId">
                  <Select placeholder="Select" allowClear options={refOptions(refData?.['outsole-materials'])} />
                </Form.Item>
              </Col>
            </Row>

            <Divider />

            {/* ── Pricing & Codes ── */}
            <Typography.Title level={5}>Pricing & Codes</Typography.Title>

            <Row gutter={16}>
              <Col xs={12} sm={6}>
                <Form.Item label="Retail Price" name="price" rules={[{ required: true }, { type: 'number', min: 0.01 }]}>
                  <InputNumber prefix="$" style={{ width: '100%' }} min={0.01} step={0.01} precision={2} placeholder="0.00" />
                </Form.Item>
              </Col>
              <Col xs={12} sm={6}>
                <Form.Item label="Cost" name="cost">
                  <InputNumber prefix="$" style={{ width: '100%' }} min={0} step={0.01} precision={2} placeholder="0.00" />
                </Form.Item>
              </Col>
              <Col xs={12} sm={6}>
                <Form.Item label="Barcode / UPC" name="barcode">
                  <Input placeholder="Auto if blank" />
                </Form.Item>
              </Col>
              <Col xs={12} sm={6}>
                <Form.Item label="Season Code" name="season">
                  <Input placeholder="e.g. SS26" />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col xs={24} sm={12}>
                <Form.Item label="Keywords" name="keywords" rules={[{ max: 500 }]}>
                  <Input placeholder="Search keywords (comma-separated)" />
                </Form.Item>
              </Col>
            </Row>

            <Divider />

            <Form.Item>
              <Space>
                <Button
                  type="primary"
                  htmlType="submit"
                  icon={<SaveOutlined />}
                  loading={isSaving}
                  size="large"
                >
                  {isEdit ? 'Update SKU' : 'Create SKU'}
                </Button>
                <Button onClick={() => navigate('/inventory/skus')} size="large">
                  Cancel
                </Button>
              </Space>
            </Form.Item>
          </Form>
        </Card>
      </Space>
    </App>
  )
}

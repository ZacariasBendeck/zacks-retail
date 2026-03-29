import { useState, useEffect } from 'react'
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
} from 'antd'
import { ArrowLeftOutlined, SaveOutlined, CameraOutlined, LoadingOutlined, SearchOutlined } from '@ant-design/icons'
import { useSku, useCreateSku, useUpdateSku, useVendors, useAnalyzeImage, useReferenceData, useLookupSku } from '../../hooks/useSkus'
import type { Department, SkuCreatePayload, ReferenceItem } from '../../types/sku'

const DEPARTMENTS: Department[] = ['FORMAL', 'CASUAL', 'FIESTA', 'SANDALIAS', 'BOOTS', 'COMFORT']

function refOptions(items: ReferenceItem[] | undefined) {
  if (!items) return []
  return items.map((i) => ({ label: i.name, value: i.id }))
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

    try {
      const result = await analyzeMutation.mutateAsync(file)
      const fieldsToSet: Record<string, any> = {}

      if (result.color) fieldsToSet.color = result.color
      if (result.department) fieldsToSet.department = result.department
      if (result.description) fieldsToSet.description = result.description

      form.setFieldsValue(fieldsToSet)
      message.success('AI analysis complete — form fields updated. You can adjust any values.')
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Image analysis failed'
      message.error(errMsg)
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
            <Typography.Text strong><CameraOutlined /> AI Image Analysis</Typography.Text>
            <Typography.Text type="secondary" style={{ marginLeft: 8 }}>
              Drop a shoe photo to auto-fill attributes
            </Typography.Text>

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

            {analyzeMutation.isSuccess && analyzeMutation.data && (
              <Alert
                type="info"
                showIcon
                style={{ marginTop: 8 }}
                message="AI Suggestions Applied"
                description={
                  <div style={{ fontSize: 12 }}>
                    {analyzeMutation.data.shoe_type && <span><strong>Type:</strong> {analyzeMutation.data.shoe_type} | </span>}
                    {analyzeMutation.data.heel_height && <span><strong>Heel:</strong> {analyzeMutation.data.heel_height} | </span>}
                    {analyzeMutation.data.upper_material && <span><strong>Material:</strong> {analyzeMutation.data.upper_material} | </span>}
                    {analyzeMutation.data.color_family && <span><strong>Color:</strong> {analyzeMutation.data.color_family} | </span>}
                    {analyzeMutation.data.occasion && <span><strong>Occasion:</strong> {analyzeMutation.data.occasion}</span>}
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
                <Form.Item label="Color" name="color" rules={[{ required: true }, { max: 50 }]}>
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
                <Form.Item label="Shoe Type" name="shoeTypeId">
                  <Select placeholder="Select" allowClear showSearch optionFilterProp="label" options={refOptions(refData?.['shoe-types'])} />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col xs={24} sm={12}>
                <Form.Item label="Description" name="description" rules={[{ max: 500 }]}>
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
                <Form.Item label="Department" name="department" rules={[{ required: true }]}>
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
                <Form.Item label="Occasion" name="occasionId">
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
                <Form.Item label="Color Family" name="colorFamilyId">
                  <Select placeholder="Select" allowClear showSearch optionFilterProp="label" options={refOptions(refData?.['color-families'])} />
                </Form.Item>
              </Col>
              <Col xs={12} sm={6}>
                <Form.Item label="Pattern" name="patternId">
                  <Select placeholder="Select" allowClear options={refOptions(refData?.['patterns'])} />
                </Form.Item>
              </Col>
              <Col xs={12} sm={6}>
                <Form.Item label="Finish" name="finishId">
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
                <Form.Item label="Heel Height" name="heelHeightId">
                  <Select placeholder="Select" allowClear options={refOptions(refData?.['heel-heights'])} />
                </Form.Item>
              </Col>
              <Col xs={12} sm={6}>
                <Form.Item label="Heel Shape" name="heelShapeId">
                  <Select placeholder="Select" allowClear options={refOptions(refData?.['heel-shapes'])} />
                </Form.Item>
              </Col>
              <Col xs={12} sm={6}>
                <Form.Item label="Toe Shape" name="toeShapeId">
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
                <Form.Item label="Upper Material" name="upperMaterialId">
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

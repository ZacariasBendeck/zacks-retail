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
} from 'antd'
import { ArrowLeftOutlined, SaveOutlined, CameraOutlined, LoadingOutlined } from '@ant-design/icons'
import { useSku, useCreateSku, useUpdateSku, useVendors, useAnalyzeImage } from '../../hooks/useSkus'
import type { Department, SkuCreatePayload } from '../../types/sku'

const DEPARTMENTS: Department[] = ['FORMAL', 'CASUAL', 'FIESTA', 'SANDALIAS', 'BOOTS', 'COMFORT']

export default function SkuFormPage() {
  const { skuId } = useParams<{ skuId: string }>()
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [form] = Form.useForm()

  const isEdit = !!skuId
  const { data: sku, isLoading: skuLoading } = useSku(skuId)
  const { data: vendors, isLoading: vendorsLoading } = useVendors()
  const createMutation = useCreateSku()
  const updateMutation = useUpdateSku()
  const analyzeMutation = useAnalyzeImage()
  const [imagePreview, setImagePreview] = useState<string | null>(null)

  useEffect(() => {
    if (sku) {
      form.setFieldsValue({
        brand: sku.brand,
        style: sku.style,
        color: sku.color,
        size: sku.size,
        price: sku.price,
        category: sku.category,
        department: sku.department,
        vendorId: sku.vendorId,
        barcode: sku.barcode,
        description: sku.description,
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

  const isSaving = createMutation.isPending || updateMutation.isPending

  if (isEdit && skuLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    )
  }

  return (
    <App>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
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
                  <Typography.Text type="secondary">({sku.skuCode})</Typography.Text>
                )}
              </Space>
            </Col>
          </Row>
        </Card>

        {!isEdit && (
          <Card>
            <Typography.Title level={5} style={{ marginTop: 0 }}>
              <CameraOutlined /> AI Image Analysis
            </Typography.Title>
            <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
              Drop a shoe photo to auto-fill attributes using AI
            </Typography.Text>

            <Row gutter={16} align="top">
              <Col xs={24} sm={imagePreview ? 12 : 24}>
                <Upload.Dragger
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  showUploadList={false}
                  beforeUpload={(file) => {
                    handleImageUpload(file)
                    return false
                  }}
                  disabled={analyzeMutation.isPending}
                  style={{ padding: '20px 0' }}
                >
                  {analyzeMutation.isPending ? (
                    <div>
                      <LoadingOutlined style={{ fontSize: 32, color: '#1677ff' }} />
                      <p style={{ marginTop: 8 }}>Analyzing image with AI...</p>
                    </div>
                  ) : (
                    <div>
                      <CameraOutlined style={{ fontSize: 32, color: '#999' }} />
                      <p style={{ marginTop: 8 }}>Click or drag a shoe image here</p>
                      <p style={{ color: '#999', fontSize: 12 }}>JPEG, PNG, GIF, or WebP — max 10 MB</p>
                    </div>
                  )}
                </Upload.Dragger>
              </Col>
              {imagePreview && (
                <Col xs={24} sm={12}>
                  <img
                    src={imagePreview}
                    alt="Uploaded shoe"
                    style={{
                      width: '100%',
                      maxHeight: 200,
                      objectFit: 'contain',
                      borderRadius: 8,
                      border: '1px solid #d9d9d9',
                    }}
                  />
                </Col>
              )}
            </Row>

            {analyzeMutation.isSuccess && analyzeMutation.data && (
              <Alert
                type="info"
                showIcon
                style={{ marginTop: 16 }}
                message="AI Suggestions Applied"
                description={
                  <div style={{ fontSize: 12 }}>
                    {analyzeMutation.data.shoe_type && <span><strong>Type:</strong> {analyzeMutation.data.shoe_type} &nbsp;|&nbsp; </span>}
                    {analyzeMutation.data.heel_height && <span><strong>Heel:</strong> {analyzeMutation.data.heel_height} &nbsp;|&nbsp; </span>}
                    {analyzeMutation.data.toe_shape && <span><strong>Toe:</strong> {analyzeMutation.data.toe_shape} &nbsp;|&nbsp; </span>}
                    {analyzeMutation.data.upper_material && <span><strong>Material:</strong> {analyzeMutation.data.upper_material} &nbsp;|&nbsp; </span>}
                    {analyzeMutation.data.color_family && <span><strong>Color Family:</strong> {analyzeMutation.data.color_family} &nbsp;|&nbsp; </span>}
                    {analyzeMutation.data.finish && <span><strong>Finish:</strong> {analyzeMutation.data.finish} &nbsp;|&nbsp; </span>}
                    {analyzeMutation.data.pattern && <span><strong>Pattern:</strong> {analyzeMutation.data.pattern} &nbsp;|&nbsp; </span>}
                    {analyzeMutation.data.occasion && <span><strong>Occasion:</strong> {analyzeMutation.data.occasion}</span>}
                  </div>
                }
              />
            )}
          </Card>
        )}

        <Card>
          <Form
            form={form}
            layout="vertical"
            onFinish={handleSubmit}
            requiredMark="optional"
            style={{ maxWidth: 800 }}
          >
            <Typography.Title level={5}>Product Details</Typography.Title>

            <Row gutter={16}>
              <Col xs={24} sm={12}>
                <Form.Item
                  label="Brand"
                  name="brand"
                  rules={[
                    { required: true, message: 'Brand is required' },
                    { max: 100, message: 'Max 100 characters' },
                  ]}
                >
                  <Input placeholder="e.g. Nike" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item
                  label="Style"
                  name="style"
                  rules={[
                    { required: true, message: 'Style is required' },
                    { max: 100, message: 'Max 100 characters' },
                  ]}
                >
                  <Input placeholder="e.g. Oxford" />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col xs={24} sm={8}>
                <Form.Item
                  label="Color"
                  name="color"
                  rules={[
                    { required: true, message: 'Color is required' },
                    { max: 50, message: 'Max 50 characters' },
                  ]}
                >
                  <Input placeholder="e.g. Black" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8}>
                <Form.Item
                  label="Size"
                  name="size"
                  rules={[{ required: true, message: 'Size is required' }]}
                >
                  <Input placeholder="e.g. 9.5" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8}>
                <Form.Item
                  label="Price"
                  name="price"
                  rules={[
                    { required: true, message: 'Price is required' },
                    { type: 'number', min: 0.01, message: 'Price must be positive' },
                  ]}
                >
                  <InputNumber
                    prefix="$"
                    style={{ width: '100%' }}
                    min={0.01}
                    step={0.01}
                    precision={2}
                    placeholder="0.00"
                  />
                </Form.Item>
              </Col>
            </Row>

            <Divider />
            <Typography.Title level={5}>Classification</Typography.Title>

            <Row gutter={16}>
              <Col xs={24} sm={8}>
                <Form.Item
                  label="Department"
                  name="department"
                  rules={[{ required: true, message: 'Department is required' }]}
                >
                  <Select
                    placeholder="Select department"
                    options={DEPARTMENTS.map((d) => ({ label: d, value: d }))}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8}>
                <Form.Item
                  label="Category"
                  name="category"
                  rules={[
                    { required: true, message: 'Category is required' },
                    {
                      type: 'number',
                      min: 556,
                      max: 599,
                      message: 'Must be between 556 and 599',
                    },
                  ]}
                >
                  <InputNumber
                    style={{ width: '100%' }}
                    min={556}
                    max={599}
                    precision={0}
                    placeholder="556-599"
                  />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8}>
                <Form.Item
                  label="Vendor"
                  name="vendorId"
                  rules={[{ required: true, message: 'Vendor is required' }]}
                >
                  <Select
                    placeholder="Search vendors..."
                    showSearch
                    optionFilterProp="label"
                    loading={vendorsLoading}
                    options={vendors?.map((v) => ({ label: v.name, value: v.id }))}
                  />
                </Form.Item>
              </Col>
            </Row>

            <Divider />
            <Typography.Title level={5}>Additional Info</Typography.Title>

            <Row gutter={16}>
              <Col xs={24} sm={12}>
                <Form.Item
                  label="Barcode"
                  name="barcode"
                >
                  <Input placeholder="Optional — leave blank for auto-generation" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item
                  label="Description"
                  name="description"
                  rules={[{ max: 500, message: 'Max 500 characters' }]}
                >
                  <Input.TextArea rows={1} placeholder="Optional product description" />
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

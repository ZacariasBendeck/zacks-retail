import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Tabs,
  Tag,
  Typography,
} from 'antd'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  useCreateProductsSku,
  useProductsSku,
  useUpdateProductsSku,
} from '../../../hooks/useProductsSkus'
import { useResolveTaxonomy } from '../../../hooks/useProductsTaxonomy'
import type { SkuInput } from '../../../types/productsSku'
import SkuAttributesTab from './SkuAttributesTab'

type FormShape = Omit<SkuInput, 'keywords' | 'bulletText'> & {
  keywordsText?: string
  bullet1?: string
  bullet2?: string
  bullet3?: string
  bullet4?: string
  bullet5?: string
}

export default function SkuFormPage() {
  const { code: codeParam } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [form] = Form.useForm<FormShape>()
  const editing = codeParam != null && codeParam !== 'new'
  const { data } = useProductsSku(editing ? codeParam : undefined)
  const create = useCreateProductsSku()
  const update = useUpdateProductsSku()

  // Live-resolve Category → Department → Sector as the user types / the record
  // loads. The rollup is read-only: users pick a Category; RICS's range-based
  // lookup determines the Department + Sector (p. 144–145). We display it as
  // a confirmation, and block save if Category has no covering Department.
  const [currentCategory, setCurrentCategory] = useState<number | null>(null)
  const resolved = useResolveTaxonomy(currentCategory ?? undefined)
  const departmentMissing =
    currentCategory != null && resolved.data != null && resolved.data.department == null

  useEffect(() => {
    if (editing && data) {
      form.setFieldsValue({
        ...data,
        keywordsText: data.keywords.join(' '),
        bullet1: data.bulletText[0] ?? '',
        bullet2: data.bulletText[1] ?? '',
        bullet3: data.bulletText[2] ?? '',
        bullet4: data.bulletText[3] ?? '',
        bullet5: data.bulletText[4] ?? '',
      } as Partial<FormShape>)
      setCurrentCategory(data.category ?? null)
    }
  }, [editing, data, form])

  const onFinish = async (values: FormShape) => {
    // Rollup enforcement: the user's request is "Department is required for each
    // SKU". RICS doesn't have a Department column on SKU (derived via range
    // lookup), so we enforce "Category must map to a Department" at save time.
    if (departmentMissing) {
      message.error(
        `Category ${currentCategory} is not covered by any Department. Expand a Department's BegCateg..EndCateg range or pick a different Category before saving.`,
      )
      return
    }
    const {
      keywordsText,
      bullet1,
      bullet2,
      bullet3,
      bullet4,
      bullet5,
      ...rest
    } = values
    const payload: SkuInput = {
      ...rest,
      keywords: (keywordsText ?? '')
        .split(/\s+/)
        .map((s) => s.trim())
        .filter(Boolean),
      bulletText: [bullet1, bullet2, bullet3, bullet4, bullet5]
        .map((s) => (s ?? '').trim())
        .filter(Boolean),
    }
    try {
      if (editing && codeParam) {
        const { code: _drop, ...patch } = payload
        await update.mutateAsync({ code: codeParam, patch })
        message.success('SKU updated')
      } else {
        await create.mutateAsync(payload)
        message.success('SKU created')
      }
      navigate('/products/skus')
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  return (
    <Card
      title={
        <Typography.Text strong>{editing ? `Edit SKU: ${codeParam}` : 'New SKU'}</Typography.Text>
      }
    >
      <Form<FormShape>
        form={form}
        layout="vertical"
        onFinish={onFinish}
        initialValues={{
          currentPriceSlot: 'RETAIL',
          coupon: false,
        }}
      >
        <Tabs
          defaultActiveKey="core"
          items={[
            {
              key: 'core',
              label: 'Core',
              children: (
                <>
                  <Form.Item
                    name="code"
                    label="SKU (up to 15 chars, alphanumeric — RICS p. 154)"
                    rules={[
                      { required: true, message: 'SKU is required' },
                      { max: 15 },
                    ]}
                  >
                    <Input disabled={editing} style={{ textTransform: 'uppercase' }} />
                  </Form.Item>
                  <Form.Item
                    name="description"
                    label="Description"
                    rules={[{ required: true, max: 30 }]}
                  >
                    <Input />
                  </Form.Item>
                  <Form.Item
                    name="vendor"
                    label="Vendor code"
                    rules={[{ required: true, max: 4 }]}
                  >
                    <Input style={{ textTransform: 'uppercase' }} />
                  </Form.Item>
                  <Form.Item
                    name="category"
                    label="Category"
                    rules={[{ required: true, type: 'number', min: 1, max: 999 }]}
                    extra="Department + Sector below are derived via RICS range lookup (p. 144–145)."
                  >
                    <InputNumber
                      min={1}
                      max={999}
                      style={{ width: '100%' }}
                      onChange={(v) => setCurrentCategory(typeof v === 'number' ? v : null)}
                    />
                  </Form.Item>
                  <Form.Item label="Department (derived)">
                    {currentCategory == null ? (
                      <Typography.Text type="secondary">
                        Enter a Category to resolve the Department.
                      </Typography.Text>
                    ) : resolved.isLoading ? (
                      <Typography.Text type="secondary">Resolving…</Typography.Text>
                    ) : resolved.data?.department ? (
                      <Space>
                        <Tag color="blue">{resolved.data.department.number}</Tag>
                        <Typography.Text>{resolved.data.department.description}</Typography.Text>
                        <Typography.Text type="secondary">
                          (categories {resolved.data.department.begCateg}
                          –{resolved.data.department.endCateg})
                        </Typography.Text>
                      </Space>
                    ) : (
                      <Alert
                        type="error"
                        showIcon
                        message={`No Department covers Category ${currentCategory}. Expand a Department's range or pick another Category.`}
                      />
                    )}
                  </Form.Item>
                  <Form.Item label="Sector (derived)">
                    {resolved.data?.sector ? (
                      <Space>
                        <Tag color="purple">{resolved.data.sector.number}</Tag>
                        <Typography.Text>{resolved.data.sector.description}</Typography.Text>
                        <Typography.Text type="secondary">
                          (departments {resolved.data.sector.begDept}
                          –{resolved.data.sector.endDept})
                        </Typography.Text>
                      </Space>
                    ) : currentCategory != null && resolved.data?.department ? (
                      <Alert
                        type="warning"
                        showIcon
                        message={`No Sector covers Department ${resolved.data.department.number}.`}
                      />
                    ) : (
                      <Typography.Text type="secondary">—</Typography.Text>
                    )}
                  </Form.Item>
                  <Form.Item name="vendorSku" label="Vendor SKU" rules={[{ max: 20 }]}>
                    <Input />
                  </Form.Item>
                  <Form.Item name="sizeType" label="Size Type (blank = quantity-only)">
                    <InputNumber min={1} max={99} style={{ width: '100%' }} />
                  </Form.Item>
                  <Form.Item name="styleColor" label="Style / Color (one field, RICS p. 155)" rules={[{ max: 20 }]}>
                    <Input />
                  </Form.Item>
                  <Form.Item name="season" label="Season" rules={[{ max: 2 }]}>
                    <Input />
                  </Form.Item>
                  <Form.Item name="groupCode" label="Group code" rules={[{ max: 3 }]}>
                    <Input />
                  </Form.Item>
                  <Form.Item name="location" label="Location" rules={[{ max: 10 }]}>
                    <Input />
                  </Form.Item>
                  <Form.Item name="manufacturer" label="Manufacturer" rules={[{ max: 20 }]}>
                    <Input />
                  </Form.Item>
                  <Form.Item
                    name="keywordsText"
                    label="Keywords (space-separated, each ≤10 chars, joined ≤60 — p. 165)"
                  >
                    <Input />
                  </Form.Item>
                  <Form.Item name="comment" label="Comment" rules={[{ max: 30 }]}>
                    <Input />
                  </Form.Item>
                  <Form.Item name="status" label="Status (1 char)" rules={[{ max: 1 }]}>
                    <Input maxLength={1} />
                  </Form.Item>
                  <Form.Item name="coupon" valuePropName="checked">
                    <Checkbox>Coupon SKU</Checkbox>
                  </Form.Item>
                </>
              ),
            },
            {
              key: 'pricing',
              label: 'Pricing',
              children: (
                <>
                  <Form.Item
                    name="retailPrice"
                    label="Retail"
                    rules={[{ required: true, type: 'number', min: 0 }]}
                  >
                    <InputNumber min={0} step={0.01} precision={2} style={{ width: '100%' }} />
                  </Form.Item>
                  <Form.Item name="listPrice" label="List (optional; discount stores)">
                    <InputNumber min={0} step={0.01} precision={2} style={{ width: '100%' }} />
                  </Form.Item>
                  <Form.Item name="mdPrice1" label="Markdown 1">
                    <InputNumber min={0} step={0.01} precision={2} style={{ width: '100%' }} />
                  </Form.Item>
                  <Form.Item name="mdPrice2" label="Markdown 2">
                    <InputNumber min={0} step={0.01} precision={2} style={{ width: '100%' }} />
                  </Form.Item>
                  <Form.Item
                    name="currentPriceSlot"
                    label="Current slot (RICS p. 155)"
                    rules={[{ required: true }]}
                  >
                    <Select
                      options={[
                        { value: 'LIST', label: 'List' },
                        { value: 'RETAIL', label: 'Retail' },
                        { value: 'MD1', label: 'Markdown 1' },
                        { value: 'MD2', label: 'Markdown 2' },
                      ]}
                    />
                  </Form.Item>
                  <Form.Item name="currentCost" label="Current cost">
                    <InputNumber min={0} step={0.01} precision={2} style={{ width: '100%' }} />
                  </Form.Item>
                  <Typography.Paragraph type="secondary" style={{ marginTop: 24 }}>
                    Oversize pricing (p. 156) — adds the extra amount to the price for sizes at
                    or beyond the column threshold.
                  </Typography.Paragraph>
                  <Form.Item name="oversizeColumn" label="Oversize column threshold (e.g., 105)" rules={[{ max: 3 }]}>
                    <Input />
                  </Form.Item>
                  <Form.Item name="oversizeAmount" label="Oversize extra amount">
                    <InputNumber min={0} step={0.01} precision={2} style={{ width: '100%' }} />
                  </Form.Item>
                </>
              ),
            },
            {
              key: 'perks',
              label: 'Perks',
              children: (
                <>
                  <Typography.Paragraph type="secondary">
                    Perks (RICS p. 155) — a flat dollar amount credited to the salesperson when
                    this SKU is sold. Leave blank or 0 for no perk.
                  </Typography.Paragraph>
                  <Form.Item name="perks" label="Perk amount">
                    <InputNumber min={0} step={0.01} precision={2} style={{ width: '100%' }} />
                  </Form.Item>
                  <Form.Item name="labelCode" label="Label code (1 char — R/H/J/S/O/N)">
                    <Input maxLength={1} />
                  </Form.Item>
                  <Form.Item name="colorCode" label="Color code (vendor-gated)">
                    <Input maxLength={3} />
                  </Form.Item>
                  <Form.Item name="orderMultiple" label="Order multiple">
                    <InputNumber min={1} style={{ width: '100%' }} />
                  </Form.Item>
                  <Form.Item name="orderUom" label="Order UOM" rules={[{ max: 10 }]}>
                    <Input />
                  </Form.Item>
                </>
              ),
            },
            {
              key: 'pictures',
              label: 'Pictures',
              children: (
                <>
                  <Typography.Paragraph type="secondary">
                    Pictures are filenames under <code>C:\RICSWIN\ricspics</code>. Step 8 will
                    add an upload UI; for now enter filenames directly.
                  </Typography.Paragraph>
                  <Form.Item name="pictureFileName" label="Primary picture (InventoryMaster)">
                    <Input />
                  </Form.Item>
                  <Form.Item name="pictureName01" label="Picture 01 (InvCatalog)">
                    <Input />
                  </Form.Item>
                  <Form.Item name="pictureName02" label="Picture 02 (InvCatalog)">
                    <Input />
                  </Form.Item>
                  <Form.Item name="webFileName" label="Web file name">
                    <Input />
                  </Form.Item>
                </>
              ),
            },
            {
              key: 'webOverlay',
              label: 'Web Overlay',
              children: (
                <>
                  <Typography.Paragraph type="secondary">
                    InvCatalog web-overlay fields (RICS p. 154 — optional extension of the SKU
                    for catalog/web presentation).
                  </Typography.Paragraph>
                  <Form.Item name="longColor" label="Long color" rules={[{ max: 30 }]}>
                    <Input />
                  </Form.Item>
                  <Form.Item name="boldDesc" label="Bold description" rules={[{ max: 60 }]}>
                    <Input />
                  </Form.Item>
                  <Form.Item name="paraDesc" label="Paragraph description" rules={[{ max: 255 }]}>
                    <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} />
                  </Form.Item>
                  <Form.Item name="catalogSku" label="Catalog SKU" rules={[{ max: 20 }]}>
                    <Input />
                  </Form.Item>
                  <Form.Item name="sizeText" label="Size text" rules={[{ max: 30 }]}>
                    <Input />
                  </Form.Item>
                  <Form.Item name="bullet1" label="Bullet 1" rules={[{ max: 80 }]}>
                    <Input />
                  </Form.Item>
                  <Form.Item name="bullet2" label="Bullet 2" rules={[{ max: 80 }]}>
                    <Input />
                  </Form.Item>
                  <Form.Item name="bullet3" label="Bullet 3" rules={[{ max: 80 }]}>
                    <Input />
                  </Form.Item>
                  <Form.Item name="bullet4" label="Bullet 4" rules={[{ max: 80 }]}>
                    <Input />
                  </Form.Item>
                  <Form.Item name="bullet5" label="Bullet 5" rules={[{ max: 80 }]}>
                    <Input />
                  </Form.Item>
                </>
              ),
            },
            {
              key: 'attributes',
              label: 'Atributos',
              // Only meaningful once the SKU exists — a new-SKU flow needs a
              // code first. For new SKUs we render a short hint and defer.
              children: editing && codeParam ? (
                <SkuAttributesTab skuCode={codeParam} />
              ) : (
                <Typography.Paragraph type="secondary">
                  Guarde primero el SKU; después podrá asignar atributos extendidos
                  (comprador, empresa, cadena, tipo de descuento).
                </Typography.Paragraph>
              ),
            },
          ]}
        />
        <Space>
          <Button type="primary" htmlType="submit" loading={create.isPending || update.isPending}>
            Save
          </Button>
          <Button onClick={() => navigate('/products/skus')}>Cancel</Button>
        </Space>
      </Form>
    </Card>
  )
}

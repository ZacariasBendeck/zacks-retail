import {
  App,
  Button,
  Card,
  Checkbox,
  Form,
  Input,
  Space,
  Tabs,
  Typography,
} from 'antd'
import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  useCreateVendor,
  useUpdateVendor,
  useVendor,
} from '../../../hooks/useProductsVendors'
import type { VendorInput } from '../../../types/productsVendor'
import VendorStoreAccountsEditor from './VendorStoreAccountsEditor'

type FormShape = VendorInput & { ediEnabled?: boolean }

export default function VendorFormPage() {
  const { code: codeParam } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [form] = Form.useForm<FormShape>()
  const editing = codeParam != null && codeParam !== 'new'
  const { data } = useVendor(editing ? codeParam : undefined)
  const create = useCreateVendor()
  const update = useUpdateVendor()

  useEffect(() => {
    if (editing && data) {
      form.setFieldsValue({
        ...data,
        ediEnabled: !!(data.qualifierId || data.qualifierCode),
      })
    }
  }, [editing, data, form])

  const onFinish = async (values: FormShape) => {
    // Normalize: strip ediEnabled virtual field and clear qualifier fields if off.
    const { ediEnabled, ...rest } = values
    const patch: VendorInput = {
      ...rest,
      qualifierId: ediEnabled ? (rest.qualifierId ?? '') : null,
      qualifierCode: ediEnabled ? (rest.qualifierCode ?? '') : null,
    }
    try {
      if (editing && codeParam) {
        const { code: _ignored, ...toPatch } = patch
        await update.mutateAsync({ code: codeParam, patch: toPatch })
        message.success('Vendor updated')
      } else {
        await create.mutateAsync(patch)
        message.success('Vendor created')
      }
      navigate('/products/vendors')
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  return (
    <Card
      title={
        <Typography.Text strong>{editing ? `Edit vendor: ${codeParam}` : 'New vendor'}</Typography.Text>
      }
    >
      <Form<FormShape>
        form={form}
        layout="vertical"
        onFinish={onFinish}
        initialValues={{ colorCode: false, ediEnabled: false }}
      >
        <Tabs
          defaultActiveKey="identity"
          items={[
            {
              key: 'identity',
              label: 'Identity',
              children: (
                <>
                  <Form.Item
                    name="code"
                    label="Vendor # (up to 4 alphanumeric, RICS p. 153)"
                    rules={[
                      { required: true, message: 'Vendor # is required' },
                      { max: 4, message: 'Max 4 characters' },
                      { pattern: /^[A-Za-z0-9]+$/, message: 'Alphanumeric only' },
                    ]}
                  >
                    <Input disabled={editing} style={{ textTransform: 'uppercase' }} />
                  </Form.Item>
                  <Form.Item
                    name="name"
                    label="Name (internal)"
                    rules={[{ required: true, message: 'Name is required' }, { max: 30 }]}
                  >
                    <Input />
                  </Form.Item>
                  <Form.Item
                    name="mailName"
                    label="Mail Name (prints on POs)"
                    rules={[{ required: true }, { max: 30 }]}
                  >
                    <Input />
                  </Form.Item>
                  <Form.Item name="contact" label="Contact" rules={[{ max: 30 }]}>
                    <Input />
                  </Form.Item>
                </>
              ),
            },
            {
              key: 'contact',
              label: 'Contact',
              children: (
                <>
                  <Form.Item name="addr1" label="Address 1" rules={[{ max: 30 }]}>
                    <Input />
                  </Form.Item>
                  <Form.Item name="addr2" label="Address 2" rules={[{ max: 30 }]}>
                    <Input />
                  </Form.Item>
                  <Space.Compact style={{ width: '100%' }}>
                    <Form.Item name="city" label="City" style={{ flex: 2 }} rules={[{ max: 20 }]}>
                      <Input />
                    </Form.Item>
                    <Form.Item name="state" label="State" style={{ flex: 1 }} rules={[{ max: 2 }]}>
                      <Input maxLength={2} />
                    </Form.Item>
                    <Form.Item name="zip" label="Zip" style={{ flex: 1 }} rules={[{ max: 10 }]}>
                      <Input />
                    </Form.Item>
                  </Space.Compact>
                  <Form.Item name="phone" label="Phone" rules={[{ max: 20 }]}>
                    <Input />
                  </Form.Item>
                  <Form.Item name="fax" label="Fax" rules={[{ max: 20 }]}>
                    <Input />
                  </Form.Item>
                  <Form.Item
                    name="email"
                    label="Email"
                    rules={[{ type: 'email', message: 'Invalid email' }, { max: 100 }]}
                  >
                    <Input />
                  </Form.Item>
                </>
              ),
            },
            {
              key: 'terms',
              label: 'Terms & Ship',
              children: (
                <>
                  <Form.Item name="terms" label="Terms" rules={[{ max: 30 }]}>
                    <Input />
                  </Form.Item>
                  <Form.Item name="shipInst" label="Ship Instructions" rules={[{ max: 30 }]}>
                    <Input />
                  </Form.Item>
                  <Form.Item name="comment" label="Comment" rules={[{ max: 30 }]}>
                    <Input />
                  </Form.Item>
                </>
              ),
            },
            {
              key: 'manu',
              label: 'Manufacturer',
              children: (
                <>
                  <Typography.Paragraph type="secondary">
                    Manufacturer data is separate from Vendor in RICS. Use this when the
                    upstream manufacturer differs from the billing vendor.
                  </Typography.Paragraph>
                  <Form.Item name="manuCode" label="Manu Code" rules={[{ max: 4 }]}>
                    <Input style={{ textTransform: 'uppercase' }} />
                  </Form.Item>
                  <Form.Item name="manuName" label="Manu Name" rules={[{ max: 30 }]}>
                    <Input />
                  </Form.Item>
                </>
              ),
            },
            {
              key: 'edi',
              label: 'EDI',
              children: (
                <>
                  <Form.Item name="ediEnabled" valuePropName="checked" label=" " colon={false}>
                    <Checkbox>EDI enabled</Checkbox>
                  </Form.Item>
                  <Form.Item
                    noStyle
                    shouldUpdate={(p, n) => p.ediEnabled !== n.ediEnabled}
                  >
                    {({ getFieldValue }) => {
                      const ediOn = !!getFieldValue('ediEnabled')
                      return (
                        <>
                          <Form.Item
                            name="qualifierId"
                            label="Qualifier ID"
                            rules={
                              ediOn
                                ? [{ required: true, message: 'Required when EDI on' }, { max: 20 }]
                                : []
                            }
                          >
                            <Input disabled={!ediOn} />
                          </Form.Item>
                          <Form.Item
                            name="qualifierCode"
                            label="Qualifier Code"
                            rules={
                              ediOn
                                ? [{ required: true, message: 'Required when EDI on' }, { max: 20 }]
                                : []
                            }
                          >
                            <Input disabled={!ediOn} />
                          </Form.Item>
                        </>
                      )
                    }}
                  </Form.Item>
                </>
              ),
            },
            {
              key: 'flags',
              label: 'Flags',
              children: (
                <Form.Item name="colorCode" valuePropName="checked">
                  <Checkbox>
                    Color Code enabled — gates the SKU form's Color Code field (p. 154)
                  </Checkbox>
                </Form.Item>
              ),
            },
            {
              key: 'longComment',
              label: 'Long Comment',
              children: (
                <Form.Item
                  name="longComment"
                  label="Long comment (memo field)"
                  rules={[{ max: 32768, message: 'Max 32 KB' }]}
                >
                  <Input.TextArea autoSize={{ minRows: 4, maxRows: 20 }} />
                </Form.Item>
              ),
            },
            {
              key: 'storeAccounts',
              label: 'Store Accounts',
              disabled: !editing,
              children: editing && codeParam ? (
                <VendorStoreAccountsEditor code={codeParam} />
              ) : (
                <Typography.Paragraph type="secondary">
                  Save the vendor first, then return here to manage per-store accounts.
                </Typography.Paragraph>
              ),
            },
          ]}
        />
        <Space>
          <Button type="primary" htmlType="submit" loading={create.isPending || update.isPending}>
            Save
          </Button>
          <Button onClick={() => navigate('/products/vendors')}>Cancel</Button>
        </Space>
      </Form>
    </Card>
  )
}

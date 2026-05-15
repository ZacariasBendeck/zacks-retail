import { Form, Input, Select, Button, Typography } from 'antd'
import { useTranslation } from '@benlow-rics/i18n/react'
import type { CheckoutData } from '@/types/order'

const { Title } = Typography

const DEPARTMENTS_HN = [
  'Atlantida', 'Choluteca', 'Colon', 'Comayagua', 'Copan',
  'Cortes', 'El Paraiso', 'Francisco Morazan', 'Gracias a Dios',
  'Intibuca', 'Islas de la Bahia', 'La Paz', 'Lempira',
  'Ocotepeque', 'Olancho', 'Santa Barbara', 'Valle', 'Yoro',
]

interface CheckoutFormProps {
  onSubmit: (data: CheckoutData) => void
  loading?: boolean
}

export default function CheckoutForm({ onSubmit, loading }: CheckoutFormProps) {
  const { t } = useTranslation('storefront')
  const [form] = Form.useForm<CheckoutData>()
  const paymentMethods = [
    { value: 'cash_on_delivery', label: t('checkoutForm.payment.cashOnDelivery') },
    { value: 'bank_transfer', label: t('checkoutForm.payment.bankTransfer') },
    { value: 'card', label: t('checkoutForm.payment.card') },
  ]

  return (
    <Form form={form} layout="vertical" onFinish={onSubmit} requiredMark={false} size="large">
      <Title level={4}>{t('checkoutForm.shippingInfo')}</Title>

      <Form.Item name="shippingName" label={t('checkoutForm.fullName')}
        rules={[{ required: true, message: t('checkoutForm.validation.name') }]}>
        <Input placeholder="Juan Perez" />
      </Form.Item>

      <Form.Item name="shippingPhone" label={t('checkoutForm.phone')}
        rules={[{ required: true, message: t('checkoutForm.validation.phone') }]}>
        <Input placeholder="+504 9999-9999" />
      </Form.Item>

      <Form.Item name="shippingAddress" label={t('checkoutForm.address')}
        rules={[{ required: true, message: t('checkoutForm.validation.address') }]}>
        <Input.TextArea rows={2} placeholder="Colonia, calle, casa/edificio..." />
      </Form.Item>

      <Form.Item name="shippingCity" label={t('checkoutForm.city')}
        rules={[{ required: true, message: t('checkoutForm.validation.city') }]}>
        <Input placeholder="Tegucigalpa" />
      </Form.Item>

      <Form.Item name="shippingDepartment" label={t('checkoutForm.department')}
        rules={[{ required: true, message: t('checkoutForm.validation.department') }]}>
        <Select placeholder={t('checkoutForm.selectDepartment')}
          options={DEPARTMENTS_HN.map(d => ({ value: d, label: d }))} showSearch />
      </Form.Item>

      <Form.Item name="shippingNotes" label={t('checkoutForm.notes')}>
        <Input.TextArea rows={2} placeholder={t('checkoutForm.notesPlaceholder')} />
      </Form.Item>

      <Title level={4} style={{ marginTop: 24 }}>{t('checkoutForm.paymentMethod')}</Title>

      <Form.Item name="paymentMethod" label={t('checkoutForm.paymentType')}
        rules={[{ required: true, message: t('checkoutForm.validation.payment') }]}>
        <Select placeholder={t('checkoutForm.select')} options={paymentMethods} />
      </Form.Item>

      <Button type="primary" htmlType="submit" block loading={loading} style={{ marginTop: 16 }}>
        {t('checkoutForm.confirm')}
      </Button>
    </Form>
  )
}

export interface CheckoutData {
  shippingName: string
  shippingPhone: string
  shippingAddress: string
  shippingCity: string
  shippingDepartment: string
  shippingNotes?: string
  paymentMethod: string
}

export interface Order {
  id: number
  name: string
  status: string
  date: string
  lines: { productName: string; quantity: number; unitPrice: number; subtotal: number }[]
  subtotal: number
  tax: number
  total: number
}

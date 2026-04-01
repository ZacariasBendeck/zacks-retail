export interface CartLine {
  id: number
  productId: number
  productName: string
  productImage: string | null
  skuCode: string | null
  size: string | null
  color: string | null
  quantity: number
  unitPrice: number
  subtotal: number
}

export interface Cart {
  id: number
  lines: CartLine[]
  itemCount: number
  subtotal: number
  tax: number
  total: number
}

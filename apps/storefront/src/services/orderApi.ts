import type { CheckoutData, Order } from '@/types/order'

export async function submitOrder(data: CheckoutData): Promise<Order> {
  const res = await fetch('/api/public/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(`Failed to place order: ${res.status}`)
  return res.json()
}

export async function fetchOrder(orderId: number): Promise<Order> {
  const res = await fetch(`/api/public/orders/${orderId}`)
  if (!res.ok) throw new Error(`Failed to fetch order: ${res.status}`)
  return res.json()
}

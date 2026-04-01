import type { Cart } from '@/types/cart'

export async function fetchCart(): Promise<Cart> {
  const res = await fetch('/api/public/cart')
  if (!res.ok) throw new Error(`Failed to fetch cart: ${res.status}`)
  return res.json()
}

export async function addToCart(productId: number, quantity: number = 1): Promise<Cart> {
  const res = await fetch('/api/public/cart/items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productId, quantity }),
  })
  if (!res.ok) throw new Error(`Failed to add to cart: ${res.status}`)
  return res.json()
}

export async function updateCartItem(lineId: number, quantity: number): Promise<Cart> {
  const res = await fetch('/api/public/cart/items', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lineId, quantity }),
  })
  if (!res.ok) throw new Error(`Failed to update cart: ${res.status}`)
  return res.json()
}

export async function removeCartItem(lineId: number): Promise<Cart> {
  const res = await fetch(`/api/public/cart/items/${lineId}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Failed to remove from cart: ${res.status}`)
  return res.json()
}

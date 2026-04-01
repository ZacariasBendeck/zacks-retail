import { create } from 'zustand'
import { fetchCart, addToCart, updateCartItem, removeCartItem } from '@/services/cartApi'
import type { Cart } from '@/types/cart'

interface CartState {
  cart: Cart | null
  loading: boolean
  error: string | null
  loadCart: () => Promise<void>
  addItem: (productId: number, quantity?: number) => Promise<void>
  updateItem: (lineId: number, quantity: number) => Promise<void>
  removeItem: (lineId: number) => Promise<void>
  itemCount: () => number
}

export const useCartStore = create<CartState>((set, get) => ({
  cart: null,
  loading: false,
  error: null,

  loadCart: async () => {
    set({ loading: true, error: null })
    try {
      const cart = await fetchCart()
      set({ cart, loading: false })
    } catch (err: any) {
      set({ error: err.message, loading: false })
    }
  },

  addItem: async (productId, quantity = 1) => {
    set({ loading: true, error: null })
    try {
      const cart = await addToCart(productId, quantity)
      set({ cart, loading: false })
    } catch (err: any) {
      set({ error: err.message, loading: false })
    }
  },

  updateItem: async (lineId, quantity) => {
    set({ loading: true, error: null })
    try {
      const cart = await updateCartItem(lineId, quantity)
      set({ cart, loading: false })
    } catch (err: any) {
      set({ error: err.message, loading: false })
    }
  },

  removeItem: async (lineId) => {
    set({ loading: true, error: null })
    try {
      const cart = await removeCartItem(lineId)
      set({ cart, loading: false })
    } catch (err: any) {
      set({ error: err.message, loading: false })
    }
  },

  itemCount: () => get().cart?.itemCount ?? 0,
}))

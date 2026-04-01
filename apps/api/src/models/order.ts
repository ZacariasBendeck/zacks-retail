export interface CheckoutInput {
  shippingName: string;
  shippingPhone: string;
  shippingAddress: string;
  shippingCity: string;
  shippingDepartment: string;
  shippingNotes?: string;
  paymentMethod: string;
}

export interface OrderLine {
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface Order {
  id: number;
  name: string;
  status: string;
  date: string;
  lines: OrderLine[];
  subtotal: number;
  tax: number;
  total: number;
  shipping: {
    name: string;
    phone: string;
    address: string;
    city: string;
    department: string;
    notes: string | null;
  } | null;
}

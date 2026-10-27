import { withCustomerSession } from './auth'
import { request } from './request'

export interface WalletTransaction {
  id: number
  transaction_type: string
  paid_cents: number
  bonus_cents: number
  delta_cents: number
  balance_after_cents: number
  order_number: string | null
  note: string
  created_at: string
}

export interface WalletResponse {
  balance_cents: number
  transactions: WalletTransaction[]
}

export function getWallet() {
  return withCustomerSession(() => request<WalletResponse>('/wallet'))
}

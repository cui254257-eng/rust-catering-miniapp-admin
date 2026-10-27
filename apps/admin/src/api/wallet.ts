import { apiRequest } from './client'

export interface WalletTopUpInput {
  paid_cents: number
  bonus_cents: number
  request_key: string
  note: string
}

export interface WalletTopUpResponse {
  balance_cents: number
}

export function topUpCustomerWallet(customerId: number, input: WalletTopUpInput) {
  return apiRequest<WalletTopUpResponse>(`/admin/customers/${customerId}/wallet/top-ups`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

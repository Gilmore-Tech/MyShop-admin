import { redirect } from 'next/navigation'

export default function LegacyProviderBalancesPage() {
  redirect('/payments/provider-balances')
}

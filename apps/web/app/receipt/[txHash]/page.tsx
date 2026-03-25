import { Metadata } from 'next'
import { ReceiptCard } from '@/components/receipt/ReceiptCard'
import { getTransactionByHash, formatAddress } from '@/lib/blockscout'
import { WHATSAPP_BOT_NUMBER } from '@/lib/constants'

interface ReceiptPageProps {
  params: Promise<{
    txHash: string
  }>
}

export async function generateMetadata({ params }: ReceiptPageProps): Promise<Metadata> {
  const { txHash } = await params
  return {
    title: `Payment Details | Sippy`,
    description: `View payment details for transaction ${formatAddress(txHash)}`,
  }
}

async function getTransactionDetails(txHash: string) {
  try {
    const baseUrl =
      process.env.NEXT_PUBLIC_BLOCKSCOUT_BASE_URL || 'https://arbitrum.blockscout.com/api/v2'
    const apiKey = process.env.NEXT_PUBLIC_BLOCKSCOUT_API_KEY || ''

    const url = `${baseUrl}/transactions/${txHash}${apiKey ? `?apikey=${apiKey}` : ''}`
    const response = await fetch(url, { cache: 'no-store' })

    if (!response.ok) {
      console.error(`Failed to fetch transaction ${txHash}:`, response.status)
      return null
    }

    const tx = await response.json()
    return tx
  } catch (error) {
    console.error('Failed to fetch transaction:', error)
    return null
  }
}

// Optional: Try to resolve addresses back to phone numbers
async function resolveAddressToPhone(address: string): Promise<string | null> {
  // This would require a reverse lookup endpoint in your API
  // For now, we'll return null and just show addresses
  return null
}

export default async function ReceiptPage({ params }: ReceiptPageProps) {
  const { txHash } = await params
  const transaction = await getTransactionByHash(txHash)

  if (!transaction) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-4">🔍</div>
          <h1 className="font-display text-2xl font-bold uppercase text-[var(--text-primary)] mb-2">
            Transaction Not Found
          </h1>
          <p className="text-[var(--text-muted)] mb-6">
            We couldn&apos;t find a transaction with hash{' '}
            <span className="font-mono text-sm">{formatAddress(txHash)}</span>
          </p>
          <a
            href={`https://wa.me/${WHATSAPP_BOT_NUMBER}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 bg-brand-primary hover:bg-brand-primary-hover text-white font-medium rounded-lg transition-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2"
          >
            Back to WhatsApp
          </a>
        </div>
      </div>
    )
  }

  // Fetch full transaction details to get from/to addresses
  const txDetails = await getTransactionDetails(txHash)

  // For token transfers, use the token_transfers data, not the transaction.to (which is the contract)
  let fromAddress: string
  let toAddress: string

  if (transaction.token === 'USDC' && txDetails?.token_transfers?.length > 0) {
    // USDC transfer - get actual sender/receiver from token_transfers
    // For spend permission batched txs, there are 2 transfers:
    // 1. User → Spender (spend permission pull)
    // 2. Spender → Recipient (actual transfer)
    // We want the first "from" and the last "to" to show user→recipient
    const transfers = txDetails.token_transfers
    fromAddress = transfers[0].from?.hash || txDetails.from?.hash
    toAddress = transfers[transfers.length - 1].to?.hash || transaction.counterparty
  } else {
    // Native ETH transfer
    fromAddress = txDetails?.from?.hash || transaction.counterparty
    toAddress = txDetails?.to?.hash || transaction.counterparty
  }

  // Try to resolve phone numbers (optional)
  const [fromPhone, toPhone] = await Promise.all([
    resolveAddressToPhone(fromAddress),
    resolveAddressToPhone(toAddress),
  ])

  return (
    <div className="min-h-screen relative">
      <div className="relative z-10 pt-6 sm:pt-8 md:pt-12 pb-6 sm:pb-8 px-4 sm:px-6 lg:px-8">
        {/* Receipt Card */}
        <ReceiptCard
          transaction={transaction}
          fromAddress={fromAddress}
          toAddress={toAddress}
          fromPhone={fromPhone || undefined}
          toPhone={toPhone || undefined}
        />

        {/* Actions */}
        <div className="max-w-md mx-auto mt-6 sm:mt-8 flex flex-col items-center gap-3 animate-fade-in-up animation-delay-200">
          <a
            href={`https://wa.me/${WHATSAPP_BOT_NUMBER}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-primary hover:bg-brand-primary-hover text-white font-medium rounded-xl transition-smooth text-sm"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
            </svg>
            Back to WhatsApp
          </a>
          <p className="text-xs text-[var(--text-muted)]">
            Share this receipt link with others to provide payment proof
          </p>
        </div>
      </div>
    </div>
  )
}

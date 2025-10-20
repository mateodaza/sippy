import { Metadata } from 'next';
import { ReceiptCard } from '@/components/receipt/ReceiptCard';
import { getTransactionByHash, formatAddress } from '@/lib/blockscout';
import Link from 'next/link';

interface ReceiptPageProps {
  params: Promise<{
    txHash: string;
  }>;
}

export async function generateMetadata({
  params,
}: ReceiptPageProps): Promise<Metadata> {
  const { txHash } = await params;
  return {
    title: `Payment Details | Sippy`,
    description: `View payment details for transaction ${formatAddress(
      txHash
    )}`,
  };
}

async function getTransactionDetails(txHash: string) {
  try {
    const baseUrl =
      process.env.NEXT_PUBLIC_BLOCKSCOUT_BASE_URL ||
      'https://arbitrum.blockscout.com/api/v2';
    const apiKey = process.env.NEXT_PUBLIC_BLOCKSCOUT_API_KEY || '';

    const url = `${baseUrl}/transactions/${txHash}${
      apiKey ? `?apikey=${apiKey}` : ''
    }`;
    const response = await fetch(url, { cache: 'no-store' });

    if (!response.ok) {
      console.error(`Failed to fetch transaction ${txHash}:`, response.status);
      return null;
    }

    const tx = await response.json();
    return tx;
  } catch (error) {
    console.error('Failed to fetch transaction:', error);
    return null;
  }
}

// Optional: Try to resolve addresses back to phone numbers
async function resolveAddressToPhone(address: string): Promise<string | null> {
  // This would require a reverse lookup endpoint in your API
  // For now, we'll return null and just show addresses
  return null;
}

export default async function ReceiptPage({ params }: ReceiptPageProps) {
  const { txHash } = await params;
  const transaction = await getTransactionByHash(txHash);

  if (!transaction) {
    return (
      <div className='min-h-screen flex items-center justify-center px-4'>
        <div className='text-center max-w-md'>
          <div className='text-6xl mb-4'>🔍</div>
          <h1 className='text-2xl font-bold text-gray-900 mb-2'>
            Transaction Not Found
          </h1>
          <p className='text-gray-600 mb-6'>
            We couldn't find a transaction with hash{' '}
            <span className='font-mono text-sm'>{formatAddress(txHash)}</span>
          </p>
          <Link
            href='/'
            className='inline-flex items-center px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors'
          >
            Go Home
          </Link>
        </div>
      </div>
    );
  }

  // Fetch full transaction details to get from/to addresses
  const txDetails = await getTransactionDetails(txHash);

  // For token transfers, use the token_transfers data, not the transaction.to (which is the contract)
  let fromAddress: string;
  let toAddress: string;

  if (transaction.token === 'PYUSD' && txDetails?.token_transfers?.[0]) {
    // PYUSD transfer - get actual sender/receiver from token_transfers
    fromAddress =
      txDetails.token_transfers[0].from?.hash || txDetails.from?.hash;
    toAddress =
      txDetails.token_transfers[0].to?.hash || transaction.counterparty;
  } else {
    // Native ETH transfer
    fromAddress = txDetails?.from?.hash || transaction.counterparty;
    toAddress = txDetails?.to?.hash || transaction.counterparty;
  }

  // Try to resolve phone numbers (optional)
  const [fromPhone, toPhone] = await Promise.all([
    resolveAddressToPhone(fromAddress),
    resolveAddressToPhone(toAddress),
  ]);

  return (
    <div className='min-h-screen relative'>
      <div className='relative z-10 pt-6 sm:pt-8 md:pt-12 pb-6 sm:pb-8 px-4 sm:px-6 lg:px-8'>
        {/* Back Button */}
        <div className='max-w-4xl mx-auto mb-4 sm:mb-6'>
          <Link
            href='/'
            className='inline-flex items-center text-sm sm:text-base text-gray-600 hover:text-[#059669] transition-colors font-medium'
          >
            <svg
              className='w-4 h-4 sm:w-5 sm:h-5 mr-1.5 sm:mr-2'
              fill='none'
              stroke='currentColor'
              viewBox='0 0 24 24'
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M15 19l-7-7 7-7'
              />
            </svg>
            Back to Home
          </Link>
        </div>

        {/* Receipt Card */}
        <ReceiptCard
          transaction={transaction}
          fromAddress={fromAddress}
          toAddress={toAddress}
          fromPhone={fromPhone || undefined}
          toPhone={toPhone || undefined}
        />

        {/* Share Instructions */}
        <div className='max-w-md mx-auto mt-6 sm:mt-8 text-center animate-fade-in-up animation-delay-200'>
          <p className='text-xs sm:text-sm text-gray-600'>
            Share this receipt link with others to provide payment proof
          </p>
        </div>
      </div>
    </div>
  );
}

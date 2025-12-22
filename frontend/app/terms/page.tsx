/**
 * Terms of Service Page
 * For Meta WhatsApp Business API approval
 * Focused on Colombia
 */

import Image from 'next/image';
import Link from 'next/link';
import { FileText, Mail, ArrowLeft } from 'lucide-react';

export const metadata = {
  title: 'Terms of Service - Sippy',
  description:
    'Terms of Service for Sippy WhatsApp payment service. Read our terms and conditions for using the service.',
};

export default function TermsOfServicePage() {
  const lastUpdated = 'November 8, 2025';

  return (
    <div className='min-h-screen bg-gradient-to-br from-white via-[#eefaf4] to-[#f8fbff]'>
      {/* Navigation */}
      <nav className='sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-white/60'>
        <div className='max-w-4xl mx-auto px-6 py-4 flex justify-between items-center'>
          <Link href='/' className='flex items-center gap-2'>
            <Image
              src='/images/logos/sippy_full_green.svg'
              alt='Sippy Logo'
              width={110}
              height={44}
              priority
              className='transition-smooth hover:scale-105'
            />
          </Link>
          <Link
            href='/'
            className='flex items-center gap-2 text-sm text-gray-600 hover:text-[#059669] transition-colors'
          >
            <ArrowLeft className='w-4 h-4' />
            Back to Home
          </Link>
        </div>
      </nav>

      {/* Header */}
      <header className='py-16 md:py-20'>
        <div className='max-w-4xl mx-auto px-6 text-center'>
          <div className='inline-flex items-center gap-2 px-4 py-2 bg-[#dbeafe] border border-[#93c5fd] rounded-full text-sm text-[#1e40af] mb-6'>
            <FileText className='w-4 h-4' />
            <span className='font-medium'>Terms of Service</span>
          </div>
          <h1 className='text-4xl md:text-5xl font-bold text-[#0f172a] mb-4'>
            Terms of Service
          </h1>
          <p className='text-gray-600'>Last updated: {lastUpdated}</p>
        </div>
      </header>

      {/* Content */}
      <main className='pb-20'>
        <div className='max-w-4xl mx-auto px-6'>
          <div className='bg-white rounded-2xl shadow-[0_20px_50px_rgba(15,23,42,0.08)] border border-gray-100 p-8 md:p-12'>
            <div className='prose prose-gray max-w-none'>
              {/* Introduction */}
              <section className='mb-10'>
                <h2 className='text-2xl font-bold text-gray-900 mb-4'>
                  1. Introduction
                </h2>
                <p className='text-gray-600 leading-relaxed mb-4'>
                  Welcome to Sippy. These Terms of Service ("Terms") govern your
                  use of the Sippy service ("Service"), a WhatsApp-based payment
                  application that enables users to send and receive PYUSD (PayPal
                  USD stablecoin) on the Arbitrum blockchain network.
                </p>
                <p className='text-gray-600 leading-relaxed'>
                  By using our Service, you agree to be bound by these Terms. If
                  you do not agree to these Terms, please do not use our Service.
                </p>
              </section>

              {/* Service Provider */}
              <section className='mb-10'>
                <h2 className='text-2xl font-bold text-gray-900 mb-4'>
                  2. Service Provider
                </h2>
                <p className='text-gray-600 leading-relaxed mb-4'>
                  The Service is provided by:
                </p>
                <div className='bg-gray-50 rounded-xl p-6 border border-gray-100'>
                  <p className='text-gray-800 font-medium'>
                    Mateo Jose Daza Benjumea
                  </p>
                  <p className='text-gray-600'>Sippy</p>
                  <p className='text-gray-600 flex items-center gap-2 mt-2'>
                    <Mail className='w-4 h-4' />
                    <a
                      href='mailto:hello@sippy.lat'
                      className='text-[#059669] hover:underline'
                    >
                      hello@sippy.lat
                    </a>
                  </p>
                  <p className='text-gray-600 mt-1'>Colombia</p>
                </div>
              </section>

              {/* Eligibility */}
              <section className='mb-10'>
                <h2 className='text-2xl font-bold text-gray-900 mb-4'>
                  3. Eligibility
                </h2>
                <p className='text-gray-600 leading-relaxed mb-4'>
                  To use our Service, you must:
                </p>
                <ul className='list-disc pl-6 text-gray-600 space-y-2'>
                  <li>Be at least 18 years of age.</li>
                  <li>
                    Have a valid WhatsApp account with an active phone number.
                  </li>
                  <li>
                    Have the legal capacity to enter into a binding agreement.
                  </li>
                  <li>
                    Not be prohibited from using the Service under applicable laws.
                  </li>
                </ul>
              </section>

              {/* Description of Service */}
              <section className='mb-10'>
                <h2 className='text-2xl font-bold text-gray-900 mb-4'>
                  4. Description of Service
                </h2>
                <p className='text-gray-600 leading-relaxed mb-4'>
                  Sippy provides a WhatsApp-based interface for:
                </p>
                <ul className='list-disc pl-6 text-gray-600 space-y-2'>
                  <li>
                    Creating a blockchain wallet linked to your phone number.
                  </li>
                  <li>
                    Sending and receiving PYUSD stablecoin to other phone numbers.
                  </li>
                  <li>Checking your PYUSD balance.</li>
                  <li>Viewing your transaction history.</li>
                </ul>
                <p className='text-gray-600 leading-relaxed mt-4'>
                  Our Service operates on the Arbitrum blockchain network and uses
                  Coinbase CDP (Coinbase Developer Platform) for secure wallet
                  management.
                </p>
              </section>

              {/* Account Creation */}
              <section className='mb-10'>
                <h2 className='text-2xl font-bold text-gray-900 mb-4'>
                  5. Account Creation and Security
                </h2>
                <p className='text-gray-600 leading-relaxed mb-4'>
                  When you create an account by sending "start" to our WhatsApp
                  bot:
                </p>
                <ul className='list-disc pl-6 text-gray-600 space-y-2'>
                  <li>
                    A blockchain wallet is automatically created and linked to your
                    phone number.
                  </li>
                  <li>
                    Your wallet private keys are securely stored by Coinbase in
                    their Trusted Execution Environment (TEE).
                  </li>
                  <li>
                    You are responsible for maintaining the security of your
                    WhatsApp account.
                  </li>
                  <li>
                    You must notify us immediately if you suspect unauthorized
                    access to your account.
                  </li>
                </ul>
              </section>

              {/* Transaction Limits */}
              <section className='mb-10'>
                <h2 className='text-2xl font-bold text-gray-900 mb-4'>
                  6. Transaction Limits and Fees
                </h2>
                <p className='text-gray-600 leading-relaxed mb-4'>
                  The following limits apply to your use of the Service:
                </p>
                <ul className='list-disc pl-6 text-gray-600 space-y-2'>
                  <li>
                    <strong>Daily Limit:</strong> $500 USD equivalent per day.
                  </li>
                  <li>
                    <strong>Per Transaction Limit:</strong> $100 USD equivalent per
                    transaction.
                  </li>
                  <li>
                    <strong>Gas Fees:</strong> Sippy covers blockchain gas fees for
                    standard transactions during the beta period.
                  </li>
                </ul>
                <p className='text-gray-600 leading-relaxed mt-4'>
                  These limits may be modified at our discretion. We will notify
                  users of any changes.
                </p>
              </section>

              {/* Acceptable Use */}
              <section className='mb-10'>
                <h2 className='text-2xl font-bold text-gray-900 mb-4'>
                  7. Acceptable Use
                </h2>
                <p className='text-gray-600 leading-relaxed mb-4'>
                  You agree NOT to use the Service for:
                </p>
                <ul className='list-disc pl-6 text-gray-600 space-y-2'>
                  <li>Any illegal activities or purposes.</li>
                  <li>Money laundering or terrorist financing.</li>
                  <li>Fraud or deceptive practices.</li>
                  <li>Circumventing transaction limits or security measures.</li>
                  <li>Spamming or sending unsolicited messages.</li>
                  <li>
                    Attempting to gain unauthorized access to our systems or other
                    users' accounts.
                  </li>
                  <li>Any activity that violates applicable laws or regulations.</li>
                </ul>
                <p className='text-gray-600 leading-relaxed mt-4'>
                  We reserve the right to suspend or terminate accounts that
                  violate these terms.
                </p>
              </section>

              {/* Blockchain and Cryptocurrency Risks */}
              <section className='mb-10'>
                <h2 className='text-2xl font-bold text-gray-900 mb-4'>
                  8. Blockchain and Cryptocurrency Risks
                </h2>
                <p className='text-gray-600 leading-relaxed mb-4'>
                  By using our Service, you acknowledge and accept the following
                  risks:
                </p>
                <ul className='list-disc pl-6 text-gray-600 space-y-2'>
                  <li>
                    <strong>Irreversible Transactions:</strong> Blockchain
                    transactions are irreversible. Once a transaction is confirmed,
                    it cannot be undone.
                  </li>
                  <li>
                    <strong>Price Volatility:</strong> While PYUSD is designed as a
                    stablecoin, cryptocurrency values can fluctuate.
                  </li>
                  <li>
                    <strong>Technology Risks:</strong> Blockchain technology is
                    subject to technical issues, bugs, and security
                    vulnerabilities.
                  </li>
                  <li>
                    <strong>Regulatory Changes:</strong> Cryptocurrency regulations
                    may change, potentially affecting the Service.
                  </li>
                  <li>
                    <strong>Network Congestion:</strong> Transactions may be delayed
                    during periods of high network activity.
                  </li>
                </ul>
              </section>

              {/* No Financial Advice */}
              <section className='mb-10'>
                <h2 className='text-2xl font-bold text-gray-900 mb-4'>
                  9. No Financial Advice
                </h2>
                <p className='text-gray-600 leading-relaxed'>
                  Sippy is a payment service and does not provide financial,
                  investment, legal, or tax advice. The Service is not intended to
                  be used for investment purposes. You should consult with
                  qualified professionals before making any financial decisions.
                </p>
              </section>

              {/* Compliance and Anti-Money Laundering */}
              <section className='mb-10'>
                <h2 className='text-2xl font-bold text-gray-900 mb-4'>
                  10. Compliance and Anti-Money Laundering
                </h2>
                <p className='text-gray-600 leading-relaxed mb-4'>
                  Sippy is committed to complying with applicable anti-money
                  laundering (AML) laws and regulations. By using our Service, you
                  agree to:
                </p>
                <ul className='list-disc pl-6 text-gray-600 space-y-2'>
                  <li>
                    Use the Service only for lawful purposes and in compliance
                    with all applicable laws.
                  </li>
                  <li>
                    Provide accurate information when requested for verification
                    purposes.
                  </li>
                  <li>
                    Not use the Service to launder money, finance terrorism, or
                    engage in other illegal financial activities.
                  </li>
                  <li>
                    Acknowledge that we may be required to report suspicious
                    activities to relevant authorities.
                  </li>
                </ul>
                <p className='text-gray-600 leading-relaxed mt-4'>
                  We reserve the right to suspend or terminate your account
                  immediately, without prior notice, if we suspect any illegal
                  activity or violation of these compliance requirements. We may
                  also be required to freeze funds or disclose information to law
                  enforcement agencies as required by law.
                </p>
              </section>

              {/* Third-Party Services */}
              <section className='mb-10'>
                <h2 className='text-2xl font-bold text-gray-900 mb-4'>
                  11. Third-Party Services
                </h2>
                <p className='text-gray-600 leading-relaxed mb-4'>
                  Our Service relies on third-party providers including:
                </p>
                <ul className='list-disc pl-6 text-gray-600 space-y-2'>
                  <li>
                    <strong>Meta (WhatsApp):</strong> For messaging services. Your
                    use is also subject to WhatsApp's Terms of Service.
                  </li>
                  <li>
                    <strong>Coinbase CDP:</strong> For wallet infrastructure and
                    key management.
                  </li>
                  <li>
                    <strong>Arbitrum Network:</strong> For blockchain transaction
                    processing.
                  </li>
                  <li>
                    <strong>PYUSD (Paxos):</strong> The stablecoin used for
                    transactions.
                  </li>
                </ul>
                <p className='text-gray-600 leading-relaxed mt-4'>
                  We are not responsible for the availability, performance, or
                  conduct of third-party services.
                </p>
              </section>

              {/* Limitation of Liability */}
              <section className='mb-10'>
                <h2 className='text-2xl font-bold text-gray-900 mb-4'>
                  12. Limitation of Liability
                </h2>
                <p className='text-gray-600 leading-relaxed mb-4'>
                  To the maximum extent permitted by law:
                </p>
                <ul className='list-disc pl-6 text-gray-600 space-y-2'>
                  <li>
                    The Service is provided "AS IS" and "AS AVAILABLE" without
                    warranties of any kind.
                  </li>
                  <li>
                    We are not liable for any direct, indirect, incidental,
                    special, or consequential damages arising from your use of the
                    Service.
                  </li>
                  <li>
                    We are not responsible for losses due to user error, including
                    sending funds to incorrect phone numbers.
                  </li>
                  <li>
                    We are not liable for service interruptions caused by
                    third-party providers or blockchain network issues.
                  </li>
                </ul>
              </section>

              {/* Indemnification */}
              <section className='mb-10'>
                <h2 className='text-2xl font-bold text-gray-900 mb-4'>
                  13. Indemnification
                </h2>
                <p className='text-gray-600 leading-relaxed'>
                  You agree to indemnify and hold harmless Sippy, its operators,
                  and affiliates from any claims, damages, losses, or expenses
                  arising from your use of the Service, your violation of these
                  Terms, or your violation of any rights of a third party.
                </p>
              </section>

              {/* Termination and Suspension */}
              <section className='mb-10'>
                <h2 className='text-2xl font-bold text-gray-900 mb-4'>
                  14. Termination and Suspension
                </h2>
                <p className='text-gray-600 leading-relaxed mb-4'>
                  We may suspend or terminate your access to the Service at any
                  time, without prior notice, for conduct that we believe:
                </p>
                <ul className='list-disc pl-6 text-gray-600 space-y-2'>
                  <li>Violates these Terms or applicable laws.</li>
                  <li>Is harmful to other users, us, or third parties.</li>
                  <li>Is fraudulent or illegal.</li>
                  <li>
                    Involves suspicious activity that may indicate money
                    laundering or other financial crimes.
                  </li>
                  <li>
                    Exceeds transaction limits or triggers security alerts.
                  </li>
                </ul>
                <p className='text-gray-600 leading-relaxed mt-4'>
                  <strong>Suspension:</strong> During a suspension, your account
                  will be temporarily disabled while we investigate. You will not
                  be able to send or receive funds through Sippy during this
                  period.
                </p>
                <p className='text-gray-600 leading-relaxed mt-4'>
                  <strong>Termination:</strong> You may stop using the Service at
                  any time. Upon termination, your wallet and any remaining PYUSD
                  balance will remain accessible on the Arbitrum blockchain
                  through other wallet applications (such as MetaMask or Coinbase
                  Wallet) using the wallet address associated with your account.
                </p>
              </section>

              {/* Disputes and Complaints */}
              <section className='mb-10'>
                <h2 className='text-2xl font-bold text-gray-900 mb-4'>
                  15. Disputes, Complaints, and Refunds
                </h2>
                <p className='text-gray-600 leading-relaxed mb-4'>
                  If you have a complaint or dispute regarding our Service,
                  please follow these steps:
                </p>
                <ul className='list-disc pl-6 text-gray-600 space-y-2 mb-4'>
                  <li>
                    <strong>Contact Support:</strong> Email us at{' '}
                    <a
                      href='mailto:hello@sippy.lat'
                      className='text-[#059669] hover:underline'
                    >
                      hello@sippy.lat
                    </a>{' '}
                    with subject line "Complaint" or "Dispute" and include your
                    phone number, transaction details, and a description of the
                    issue.
                  </li>
                  <li>
                    <strong>Response Time:</strong> We will acknowledge your
                    complaint within 3 business days and aim to resolve it
                    within 15 business days.
                  </li>
                  <li>
                    <strong>Investigation:</strong> For transaction disputes, we
                    will review blockchain records and our system logs to
                    investigate the issue.
                  </li>
                </ul>
                <h3 className='text-lg font-semibold text-gray-800 mt-6 mb-3'>
                  Refunds and Transaction Errors
                </h3>
                <ul className='list-disc pl-6 text-gray-600 space-y-2'>
                  <li>
                    <strong>Blockchain transactions are irreversible.</strong>{' '}
                    Once confirmed on the Arbitrum network, transactions cannot
                    be reversed or refunded by Sippy.
                  </li>
                  <li>
                    <strong>User error:</strong> Sippy is not responsible for
                    funds sent to incorrect phone numbers or wallet addresses.
                    Please verify recipient details before confirming
                    transactions.
                  </li>
                  <li>
                    <strong>System errors:</strong> If a technical error on our
                    part results in an incorrect transaction, we will work with
                    you to resolve the issue to the extent possible.
                  </li>
                </ul>
                <p className='text-gray-600 leading-relaxed mt-4'>
                  If you are unsatisfied with our resolution, you may file a
                  complaint with the Superintendencia de Industria y Comercio
                  (SIC) in Colombia.
                </p>
              </section>

              {/* Modifications */}
              <section className='mb-10'>
                <h2 className='text-2xl font-bold text-gray-900 mb-4'>
                  16. Modifications to Terms
                </h2>
                <p className='text-gray-600 leading-relaxed'>
                  We reserve the right to modify these Terms at any time. We will
                  notify users of material changes by posting the updated Terms on
                  our website. Your continued use of the Service after changes
                  become effective constitutes acceptance of the new Terms.
                </p>
              </section>

              {/* Governing Law */}
              <section className='mb-10'>
                <h2 className='text-2xl font-bold text-gray-900 mb-4'>
                  17. Governing Law
                </h2>
                <p className='text-gray-600 leading-relaxed'>
                  These Terms shall be governed by and construed in accordance with
                  the laws of the Republic of Colombia. Any disputes arising from
                  these Terms or your use of the Service shall be subject to the
                  exclusive jurisdiction of the courts of Colombia.
                </p>
              </section>

              {/* Severability */}
              <section className='mb-10'>
                <h2 className='text-2xl font-bold text-gray-900 mb-4'>
                  18. Severability
                </h2>
                <p className='text-gray-600 leading-relaxed'>
                  If any provision of these Terms is found to be unenforceable or
                  invalid, that provision shall be limited or eliminated to the
                  minimum extent necessary, and the remaining provisions shall
                  remain in full force and effect.
                </p>
              </section>

              {/* Contact Us */}
              <section className='mb-6'>
                <h2 className='text-2xl font-bold text-gray-900 mb-4'>
                  19. Contact Us
                </h2>
                <p className='text-gray-600 leading-relaxed mb-4'>
                  If you have any questions about these Terms, please contact us:
                </p>
                <div className='bg-[#dbeafe] rounded-xl p-6 border border-[#93c5fd]'>
                  <p className='text-gray-800 font-medium text-lg'>
                    Mateo Jose Daza Benjumea
                  </p>
                  <p className='text-gray-600 font-medium'>Sippy</p>
                  <div className='mt-3 pt-3 border-t border-blue-200'>
                    <p className='text-gray-600'>Carrera 59 # 96-153</p>
                    <p className='text-gray-600'>BRUXXEL APTO 402</p>
                    <p className='text-gray-600'>Barranquilla, Atlántico 080001</p>
                    <p className='text-gray-600'>Colombia</p>
                  </div>
                  <p className='text-gray-700 flex items-center gap-2 mt-3 pt-3 border-t border-blue-200'>
                    <Mail className='w-4 h-4 text-[#2563eb]' />
                    <a
                      href='mailto:hello@sippy.lat'
                      className='text-[#2563eb] hover:underline font-medium'
                    >
                      hello@sippy.lat
                    </a>
                  </p>
                  <p className='text-gray-600 text-sm mt-3'>
                    We will respond to your inquiry within 15 business days.
                  </p>
                </div>
              </section>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className='border-t border-gray-200 bg-white'>
        <div className='max-w-4xl mx-auto px-6 py-8'>
          <div className='flex flex-col md:flex-row justify-between items-center gap-4'>
            <div className='flex items-center gap-2'>
              <Image
                src='/images/logos/sippy-green.svg'
                alt='Sippy'
                width={20}
                height={20}
              />
              <p className='text-sm text-gray-600'>
                © {new Date().getFullYear()} Sippy. All rights reserved.
              </p>
            </div>
            <div className='flex gap-6 text-sm text-gray-600'>
              <Link
                href='/'
                className='hover:text-[#059669] transition-colors font-medium'
              >
                Home
              </Link>
              <Link
                href='/privacy'
                className='hover:text-[#059669] transition-colors font-medium'
              >
                Privacy Policy
              </Link>
              <Link
                href='/terms'
                className='text-[#059669] font-medium'
              >
                Terms of Service
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

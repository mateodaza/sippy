/**
 * Privacy Policy Page
 * For Meta WhatsApp Business API approval
 * Focused on Colombia (Ley 1581 de 2012)
 */

import Image from 'next/image';
import Link from 'next/link';
import { Shield, Mail, ArrowLeft } from 'lucide-react';

export const metadata = {
  title: 'Privacy Policy - Sippy',
  description:
    'Privacy Policy for Sippy WhatsApp payment service. Learn how we collect, use, and protect your data.',
};

export default function PrivacyPolicyPage() {
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
          <div className='inline-flex items-center gap-2 px-4 py-2 bg-[#dcfce7] border border-[#bbf7d0] rounded-full text-sm text-[#15803d] mb-6'>
            <Shield className='w-4 h-4' />
            <span className='font-medium'>Privacy Policy</span>
          </div>
          <h1 className='text-4xl md:text-5xl font-bold text-[#0f172a] mb-4'>
            Privacy Policy
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
                  Welcome to Sippy ("we," "our," or "us"). Sippy is a WhatsApp-based
                  payment service that allows users to send and receive digital
                  dollars using phone numbers. This Privacy Policy
                  explains how we collect, use, disclose, and protect your
                  information when you use our service.
                </p>
                <p className='text-gray-600 leading-relaxed'>
                  By using Sippy, you agree to the collection and use of
                  information in accordance with this policy. This policy complies
                  with Colombian data protection laws (Ley 1581 de 2012) and
                  applicable regulations.
                </p>
              </section>

              {/* Data Controller */}
              <section className='mb-10'>
                <h2 className='text-2xl font-bold text-gray-900 mb-4'>
                  2. Data Controller
                </h2>
                <p className='text-gray-600 leading-relaxed mb-4'>
                  The data controller responsible for your personal information is:
                </p>
                <div className='bg-gray-50 rounded-xl p-6 border border-gray-100'>
                  <p className='text-gray-800 font-medium text-lg'>
                    Sippy
                  </p>
                  <p className='text-gray-600 font-medium'>Company registration in progress</p>
                  <p className='text-gray-600 flex items-center gap-2 mt-3 pt-3 border-t border-gray-200'>
                    <Mail className='w-4 h-4' />
                    <a
                      href='mailto:hello@sippy.lat'
                      className='text-[#059669] hover:underline'
                    >
                      hello@sippy.lat
                    </a>
                  </p>
                </div>
              </section>

              {/* Information We Collect */}
              <section className='mb-10'>
                <h2 className='text-2xl font-bold text-gray-900 mb-4'>
                  3. Information We Collect
                </h2>
                <p className='text-gray-600 leading-relaxed mb-4'>
                  We collect the following types of information when you use our
                  service:
                </p>

                <h3 className='text-lg font-semibold text-gray-800 mt-6 mb-3'>
                  3.1 Information You Provide
                </h3>
                <ul className='list-disc pl-6 text-gray-600 space-y-2'>
                  <li>
                    <strong>Phone Number:</strong> Your WhatsApp phone number,
                    which serves as your account identifier and wallet address.
                  </li>
                  <li>
                    <strong>Messages:</strong> The messages you send to our
                    WhatsApp bot to execute commands (e.g., "send $10 to
                    +573001234567").
                  </li>
                </ul>

                <h3 className='text-lg font-semibold text-gray-800 mt-6 mb-3'>
                  3.2 Information Collected Automatically
                </h3>
                <ul className='list-disc pl-6 text-gray-600 space-y-2'>
                  <li>
                    <strong>Account Address:</strong> A unique payment address
                    automatically generated and associated with your phone number.
                  </li>
                  <li>
                    <strong>Transaction History:</strong> Records of dollar
                    transfers you make or receive, stored on the Arbitrum
                    network (a public blockchain).
                  </li>
                  <li>
                    <strong>Account Activity:</strong> Timestamps of your last
                    activity, daily transaction amounts for security limits.
                  </li>
                </ul>
              </section>

              {/* Consent and Opt-In */}
              <section className='mb-10'>
                <h2 className='text-2xl font-bold text-gray-900 mb-4'>
                  4. Consent and Opt-In
                </h2>
                <p className='text-gray-600 leading-relaxed mb-4'>
                  By initiating a conversation with our WhatsApp bot (sending
                  "start" or any message), you:
                </p>
                <ul className='list-disc pl-6 text-gray-600 space-y-2'>
                  <li>
                    <strong>Opt-in to receive messages:</strong> You consent to
                    receive transactional messages, notifications, and responses
                    from Sippy via WhatsApp.
                  </li>
                  <li>
                    <strong>Consent to data processing:</strong> You agree to
                    the collection and processing of your data as described in
                    this policy.
                  </li>
                  <li>
                    <strong>Acknowledge the service terms:</strong> You confirm
                    that you have read and accept our Terms of Service.
                  </li>
                </ul>
                <p className='text-gray-600 leading-relaxed mt-4'>
                  You may withdraw your consent at any time by contacting us at{' '}
                  <a
                    href='mailto:hello@sippy.lat'
                    className='text-[#059669] hover:underline'
                  >
                    hello@sippy.lat
                  </a>{' '}
                  or by stopping interaction with our WhatsApp bot.
                </p>
              </section>

              {/* How We Use Your Information */}
              <section className='mb-10'>
                <h2 className='text-2xl font-bold text-gray-900 mb-4'>
                  5. How We Use Your Information
                </h2>
                <p className='text-gray-600 leading-relaxed mb-4'>
                  We use the collected information for the following purposes:
                </p>
                <ul className='list-disc pl-6 text-gray-600 space-y-2'>
                  <li>
                    <strong>Provide Services:</strong> To create and manage your
                    wallet, process transactions, and respond to your commands.
                  </li>
                  <li>
                    <strong>Security:</strong> To enforce daily spending limits
                    and detect fraudulent or unauthorized activity.
                  </li>
                  <li>
                    <strong>Communication:</strong> To send you transaction
                    confirmations, notifications, and support messages via
                    WhatsApp.
                  </li>
                  <li>
                    <strong>Service Improvement:</strong> To understand how our
                    service is used and improve user experience.
                  </li>
                  <li>
                    <strong>Legal Compliance:</strong> To comply with applicable
                    laws, regulations, and legal requests.
                  </li>
                </ul>
                <p className='text-gray-600 leading-relaxed mt-4'>
                  <strong>Important:</strong> We only use data obtained through
                  WhatsApp for purposes reasonably necessary to provide our
                  payment service. We do not use your data for marketing or
                  share it with third parties for advertising purposes.
                </p>
              </section>

              {/* Information We Do NOT Collect */}
              <section className='mb-10'>
                <h2 className='text-2xl font-bold text-gray-900 mb-4'>
                  6. Information We Do NOT Collect
                </h2>
                <p className='text-gray-600 leading-relaxed mb-4'>
                  To protect your privacy and security, we do NOT collect or
                  request:
                </p>
                <ul className='list-disc pl-6 text-gray-600 space-y-2'>
                  <li>Bank account numbers or banking credentials</li>
                  <li>Credit or debit card numbers</li>
                  <li>
                    Government-issued identification numbers (cédula, passport)
                  </li>
                  <li>Passwords or PINs</li>
                  <li>Biometric data</li>
                </ul>
                <p className='text-gray-600 leading-relaxed mt-4'>
                  <strong>Warning:</strong> Sippy will never ask you to share
                  sensitive financial information through WhatsApp. If someone
                  requests this information claiming to be Sippy, do not respond
                  and report it to us immediately.
                </p>
              </section>

              {/* Third-Party Services */}
              <section className='mb-10'>
                <h2 className='text-2xl font-bold text-gray-900 mb-4'>
                  7. Third-Party Services
                </h2>
                <p className='text-gray-600 leading-relaxed mb-4'>
                  We use the following third-party services to provide our
                  service:
                </p>
                <ul className='list-disc pl-6 text-gray-600 space-y-3'>
                  <li>
                    <strong>Meta (WhatsApp Business API):</strong> To receive and
                    send messages through WhatsApp. Your messages are processed
                    through Meta's servers.{' '}
                    <a
                      href='https://www.whatsapp.com/legal/privacy-policy'
                      target='_blank'
                      rel='noopener noreferrer'
                      className='text-[#059669] hover:underline'
                    >
                      WhatsApp Privacy Policy
                    </a>
                  </li>
                  <li>
                    <strong>Coinbase (CDP - Coinbase Developer Platform):</strong>{' '}
                    To securely create and manage payment accounts. Security keys
                    are stored in Coinbase's secure infrastructure.{' '}
                    <a
                      href='https://www.coinbase.com/legal/privacy'
                      target='_blank'
                      rel='noopener noreferrer'
                      className='text-[#059669] hover:underline'
                    >
                      Coinbase Privacy Policy
                    </a>
                  </li>
                  <li>
                    <strong>Arbitrum Network:</strong> To process dollar
                    transactions. Arbitrum is a public blockchain, meaning
                    transaction data (amounts, addresses, timestamps) is
                    publicly visible and permanently recorded.
                  </li>
                  <li>
                    <strong>Blockscout:</strong> To retrieve transaction history
                    and balance information.
                  </li>
                  <li>
                    <strong>Groq (optional):</strong> When enabled, your message
                    text may be sent to Groq's AI service for natural language
                    processing to understand your commands. This feature can be
                    disabled. Groq processes data per their{' '}
                    <a
                      href='https://groq.com/privacy-policy/'
                      target='_blank'
                      rel='noopener noreferrer'
                      className='text-[#059669] hover:underline'
                    >
                      Privacy Policy
                    </a>
                    .
                  </li>
                </ul>
              </section>

              {/* Data Storage and Security */}
              <section className='mb-10'>
                <h2 className='text-2xl font-bold text-gray-900 mb-4'>
                  8. Data Storage and Security
                </h2>
                <p className='text-gray-600 leading-relaxed mb-4'>
                  We implement appropriate security measures to protect your
                  information:
                </p>
                <ul className='list-disc pl-6 text-gray-600 space-y-2'>
                  <li>
                    Your wallet private keys are stored securely by Coinbase in
                    their Trusted Execution Environment (TEE) and are never
                    exposed to our servers.
                  </li>
                  <li>
                    Your phone number and wallet address are stored in a secure
                    PostgreSQL database with encrypted connections (TLS).
                  </li>
                  <li>
                    <strong>Message handling:</strong> Message IDs are cached
                    temporarily in memory for deduplication (approximately 2
                    minutes). Spam counters are maintained in memory and reset
                    periodically. We do not permanently store message content in
                    our database. However, server logs may include message
                    content for operational purposes and may be retained by our
                    hosting provider according to their data retention policies.
                  </li>
                  <li>
                    Transaction data is stored on the Arbitrum network (a public
                    blockchain), which provides a permanent and publicly
                    visible record.
                  </li>
                </ul>
              </section>

              {/* Data Retention */}
              <section className='mb-10'>
                <h2 className='text-2xl font-bold text-gray-900 mb-4'>
                  9. Data Retention
                </h2>
                <p className='text-gray-600 leading-relaxed mb-4'>
                  We retain different types of data for different periods:
                </p>
                <ul className='list-disc pl-6 text-gray-600 space-y-2 mb-4'>
                  <li>
                    <strong>Account data</strong> (phone number, wallet address):
                    Retained for as long as your account is active, or until you
                    request deletion.
                  </li>
                  <li>
                    <strong>Activity data</strong> (last activity timestamp,
                    daily spending counters): Retained in the database for as
                    long as your account is active. Daily spending counters
                    reset automatically each day.
                  </li>
                  <li>
                    <strong>Message cache</strong> (message IDs, spam counters):
                    Stored in memory only, cleared on server restart or after
                    short intervals (2 minutes for deduplication). Server logs
                    containing message content may be retained by our hosting
                    provider per their policies.
                  </li>
                  <li>
                    <strong>Payment transactions</strong>: Permanently stored on
                    the Arbitrum network (a public blockchain). This data cannot
                    be deleted due to the immutable nature of blockchain records.
                  </li>
                </ul>
                <h3 className='text-lg font-semibold text-gray-800 mt-6 mb-3'>
                  Requesting Data Deletion
                </h3>
                <p className='text-gray-600 leading-relaxed'>
                  To request deletion of your account and associated data, email
                  us at{' '}
                  <a
                    href='mailto:hello@sippy.lat'
                    className='text-[#059669] hover:underline'
                  >
                    hello@sippy.lat
                  </a>{' '}
                  with subject line "Data Deletion Request" and include the phone
                  number associated with your account. We will process your
                  request within 15 business days and confirm deletion via email.
                  Note: Transaction records on the Arbitrum blockchain cannot be
                  deleted due to the immutable nature of public blockchains.
                </p>
              </section>

              {/* Your Rights (Colombia) */}
              <section className='mb-10'>
                <h2 className='text-2xl font-bold text-gray-900 mb-4'>
                  10. Your Rights
                </h2>
                <p className='text-gray-600 leading-relaxed mb-4'>
                  Under Colombian data protection law (Ley 1581 de 2012), you have
                  the following rights:
                </p>
                <ul className='list-disc pl-6 text-gray-600 space-y-2'>
                  <li>
                    <strong>Right to Access:</strong> Request information about
                    the personal data we hold about you.
                  </li>
                  <li>
                    <strong>Right to Rectification:</strong> Request correction of
                    inaccurate or incomplete data.
                  </li>
                  <li>
                    <strong>Right to Deletion:</strong> Request deletion of your
                    personal data, subject to legal retention requirements.
                  </li>
                  <li>
                    <strong>Right to Revoke Consent:</strong> Withdraw your
                    consent for data processing at any time.
                  </li>
                  <li>
                    <strong>Right to Lodge a Complaint:</strong> File a complaint
                    with the Superintendencia de Industria y Comercio (SIC) if you
                    believe your rights have been violated.
                  </li>
                </ul>
                <p className='text-gray-600 leading-relaxed mt-4'>
                  To exercise any of these rights, please contact us at{' '}
                  <a
                    href='mailto:hello@sippy.lat'
                    className='text-[#059669] hover:underline'
                  >
                    hello@sippy.lat
                  </a>
                  .
                </p>
              </section>

              {/* Children's Privacy */}
              <section className='mb-10'>
                <h2 className='text-2xl font-bold text-gray-900 mb-4'>
                  11. Children's Privacy
                </h2>
                <p className='text-gray-600 leading-relaxed'>
                  Our service is not intended for use by individuals under the age
                  of 18. We do not knowingly collect personal information from
                  children. If you are a parent or guardian and believe your child
                  has provided us with personal information, please contact us at{' '}
                  <a
                    href='mailto:hello@sippy.lat'
                    className='text-[#059669] hover:underline'
                  >
                    hello@sippy.lat
                  </a>{' '}
                  so we can take appropriate action.
                </p>
              </section>

              {/* Changes to This Policy */}
              <section className='mb-10'>
                <h2 className='text-2xl font-bold text-gray-900 mb-4'>
                  12. Changes to This Policy
                </h2>
                <p className='text-gray-600 leading-relaxed'>
                  We may update this Privacy Policy from time to time. We will
                  notify you of any changes by posting the new Privacy Policy on
                  this page and updating the "Last updated" date. We encourage you
                  to review this Privacy Policy periodically for any changes.
                </p>
              </section>

              {/* Contact Us */}
              <section className='mb-6'>
                <h2 className='text-2xl font-bold text-gray-900 mb-4'>
                  13. Contact Us
                </h2>
                <p className='text-gray-600 leading-relaxed mb-4'>
                  If you have any questions about this Privacy Policy or our data
                  practices, please contact us:
                </p>
                <div className='bg-[#dcfce7] rounded-xl p-6 border border-[#bbf7d0]'>
                  <p className='text-gray-800 font-medium text-lg'>
                    Sippy
                  </p>
                  <p className='text-gray-600 font-medium'>Company registration in progress</p>
                  <p className='text-gray-700 flex items-center gap-2 mt-3 pt-3 border-t border-green-200'>
                    <Mail className='w-4 h-4 text-[#059669]' />
                    <a
                      href='mailto:hello@sippy.lat'
                      className='text-[#059669] hover:underline font-medium'
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
                className='text-[#059669] font-medium'
              >
                Privacy Policy
              </Link>
              <Link
                href='/terms'
                className='hover:text-[#059669] transition-colors font-medium'
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

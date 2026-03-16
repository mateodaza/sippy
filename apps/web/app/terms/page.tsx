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
    <div className='min-h-screen bg-white'>
      {/* Navigation */}
      <nav aria-label='Main navigation' className='sticky top-0 z-50 bg-white/70 backdrop-blur-xl border-b border-brand-primary/10'>
        <div className='max-w-4xl mx-auto px-6 py-4 flex justify-between items-center'>
          <Link href='/' className='flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 rounded-lg'>
            <Image
              src='/images/logos/sippy-wordmark-cheetah.svg'
              alt='Sippy Logo'
              width={148}
              height={43}
              priority
              className='transition-smooth hover:scale-105'
            />
          </Link>
          <Link
            href='/'
            className='flex items-center gap-2 text-sm text-brand-dark/70 hover:text-brand-primary transition-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 rounded-lg'
          >
            <ArrowLeft className='w-4 h-4' />
            Back to Home
          </Link>
        </div>
      </nav>

      {/* Header */}
      <header className='py-12 sm:py-24'>
        <div className='max-w-[75vw] sm:max-w-4xl mx-auto text-center'>
          <div className='inline-flex items-center gap-2 px-4 py-2 bg-brand-primary-light border border-brand-primary/20 rounded-full text-sm text-brand-primary mb-6'>
            <FileText className='w-4 h-4' />
            <span className='font-medium'>Terms of Service</span>
          </div>
          <h1 className='font-display text-4xl md:text-5xl font-bold uppercase text-brand-dark mb-4'>
            Terms of Service
          </h1>
          <p className='text-brand-dark/70'>Last updated: {lastUpdated}</p>
        </div>
      </header>

      {/* Content */}
      <main id='main-content' className='pb-20'>
        <div className='max-w-[75vw] sm:max-w-4xl mx-auto'>
          <div className='panel-frame rounded-2xl bg-white p-8 md:p-12'>
            <div className='max-w-none text-brand-dark/70 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-bold [&_h2]:uppercase [&_h2]:text-brand-dark [&_h2]:mt-8 [&_h2]:mb-4 [&_p]:mb-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-4 [&_li]:mb-1 [&_a]:text-brand-primary [&_a]:hover:text-brand-primary-hover'>
              <section className='mb-10'>
                <h2 className='font-display text-2xl font-bold uppercase text-brand-dark mb-4'>
                  1. Introduction
                </h2>
                <p className='text-brand-dark/70 leading-relaxed mb-4'>
                  Welcome to Sippy. These Terms of Service (&ldquo;Terms&rdquo;) govern your
                  use of the Sippy service (&ldquo;Service&rdquo;), a WhatsApp-based payment
                  application that enables users to send and receive digital
                  dollars using phone numbers.
                </p>
                <p className='text-brand-dark/70 leading-relaxed'>
                  By using our Service, you agree to be bound by these Terms. If
                  you do not agree to these Terms, please do not use our Service.
                </p>
              </section>

              <section className='mb-10'>
                <h2 className='font-display text-2xl font-bold uppercase text-brand-dark mb-4'>
                  2. Service Provider
                </h2>
                <p className='text-brand-dark/70 leading-relaxed mb-4'>
                  The Service is provided by:
                </p>
                <div className='bg-gray-50 rounded-xl p-6 border border-brand-primary/10'>
                  <p className='text-gray-600 font-medium'>Sippy</p>
                  <p className='text-brand-dark/70'>Company registration in progress</p>
                  <p className='text-brand-dark/70 flex items-center gap-2 mt-3 pt-3 border-t border-brand-primary/10'>
                    <Mail className='w-4 h-4' />
                    <a href='mailto:hello@sippy.lat' className='text-brand-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary rounded'>
                      hello@sippy.lat
                    </a>
                  </p>
                </div>
              </section>

              <section className='mb-10'>
                <h2 className='font-display text-2xl font-bold uppercase text-brand-dark mb-4'>
                  3. Eligibility
                </h2>
                <p className='text-brand-dark/70 leading-relaxed mb-4'>To use our Service, you must:</p>
                <ul className='list-disc pl-6 text-brand-dark/70 space-y-2'>
                  <li>Be at least 18 years of age.</li>
                  <li>Have a valid WhatsApp account with an active phone number.</li>
                  <li>Have the legal capacity to enter into a binding agreement.</li>
                  <li>Not be prohibited from using the Service under applicable laws.</li>
                </ul>
              </section>

              <section className='mb-10'>
                <h2 className='font-display text-2xl font-bold uppercase text-brand-dark mb-4'>
                  4. Description of Service
                </h2>
                <p className='text-brand-dark/70 leading-relaxed mb-4'>Sippy provides a WhatsApp-based interface for:</p>
                <ul className='list-disc pl-6 text-brand-dark/70 space-y-2'>
                  <li>Creating a payment account linked to your phone number.</li>
                  <li>Sending and receiving digital dollars to other phone numbers.</li>
                  <li>Checking your balance.</li>
                  <li>Viewing your transaction history.</li>
                </ul>
                <p className='text-brand-dark/70 leading-relaxed mt-4'>
                  Our Service uses Coinbase CDP (Coinbase Developer Platform) for
                  secure account management and the Arbitrum network (a public
                  blockchain) for payment processing. Transaction data on Arbitrum
                  is publicly visible and permanently recorded.
                </p>
              </section>

              <section className='mb-10'>
                <h2 className='font-display text-2xl font-bold uppercase text-brand-dark mb-4'>
                  5. Account Creation and Security
                </h2>
                <p className='text-brand-dark/70 leading-relaxed mb-4'>
                  When you create an account by sending &ldquo;start&rdquo; to our WhatsApp bot:
                </p>
                <ul className='list-disc pl-6 text-brand-dark/70 space-y-2'>
                  <li>A payment account is automatically created and linked to your phone number.</li>
                  <li>Your account security keys are securely stored by Coinbase in their Trusted Execution Environment (TEE).</li>
                  <li>You are responsible for maintaining the security of your WhatsApp account.</li>
                  <li>You must notify us immediately if you suspect unauthorized access to your account.</li>
                </ul>
              </section>

              <section className='mb-10'>
                <h2 className='font-display text-2xl font-bold uppercase text-brand-dark mb-4'>
                  6. Transaction Limits and Fees
                </h2>
                <p className='text-brand-dark/70 leading-relaxed mb-4'>The following limits apply to your use of the Service:</p>
                <ul className='list-disc pl-6 text-brand-dark/70 space-y-2'>
                  <li><strong>Daily Limit:</strong> $500 USD equivalent per day.</li>
                  <li><strong>Per Transaction Limit:</strong> $100 USD equivalent per transaction.</li>
                  <li><strong>Transaction Fees:</strong> Sippy covers transaction fees during the beta period.</li>
                </ul>
                <p className='text-brand-dark/70 leading-relaxed mt-4'>
                  These limits may be modified at our discretion. We will notify users of any changes.
                </p>
              </section>

              <section className='mb-10'>
                <h2 className='font-display text-2xl font-bold uppercase text-brand-dark mb-4'>
                  7. Acceptable Use
                </h2>
                <p className='text-brand-dark/70 leading-relaxed mb-4'>You agree NOT to use the Service for:</p>
                <ul className='list-disc pl-6 text-brand-dark/70 space-y-2'>
                  <li>Any illegal activities or purposes.</li>
                  <li>Money laundering or terrorist financing.</li>
                  <li>Fraud or deceptive practices.</li>
                  <li>Circumventing transaction limits or security measures.</li>
                  <li>Spamming or sending unsolicited messages.</li>
                  <li>Attempting to gain unauthorized access to our systems or other users&apos; accounts.</li>
                  <li>Any activity that violates applicable laws or regulations.</li>
                </ul>
                <p className='text-brand-dark/70 leading-relaxed mt-4'>
                  We reserve the right to suspend or terminate accounts that violate these terms.
                </p>
              </section>

              <section className='mb-10'>
                <h2 className='font-display text-2xl font-bold uppercase text-brand-dark mb-4'>
                  8. Transaction Risks
                </h2>
                <p className='text-brand-dark/70 leading-relaxed mb-4'>
                  By using our Service, you acknowledge and accept the following risks:
                </p>
                <ul className='list-disc pl-6 text-brand-dark/70 space-y-2'>
                  <li><strong>Irreversible Transactions:</strong> Transactions are irreversible. Once a transaction is confirmed, it cannot be undone.</li>
                  <li><strong>Technology Risks:</strong> Digital payment systems are subject to technical issues, bugs, and security vulnerabilities.</li>
                  <li><strong>Regulatory Changes:</strong> Digital payment regulations may change, potentially affecting the Service.</li>
                  <li><strong>Network Delays:</strong> Transactions may be delayed during periods of high network activity.</li>
                </ul>
              </section>

              <section className='mb-10'>
                <h2 className='font-display text-2xl font-bold uppercase text-brand-dark mb-4'>
                  9. No Financial Advice
                </h2>
                <p className='text-brand-dark/70 leading-relaxed'>
                  Sippy is a payment service and does not provide financial,
                  investment, legal, or tax advice. The Service is not intended to
                  be used for investment purposes. You should consult with
                  qualified professionals before making any financial decisions.
                </p>
              </section>

              <section className='mb-10'>
                <h2 className='font-display text-2xl font-bold uppercase text-brand-dark mb-4'>
                  10. Compliance and Anti-Money Laundering
                </h2>
                <p className='text-brand-dark/70 leading-relaxed mb-4'>
                  Sippy is committed to complying with applicable anti-money laundering (AML) laws and regulations. By using our Service, you agree to:
                </p>
                <ul className='list-disc pl-6 text-brand-dark/70 space-y-2'>
                  <li>Use the Service only for lawful purposes and in compliance with all applicable laws.</li>
                  <li>Provide accurate information when requested for verification purposes.</li>
                  <li>Not use the Service to launder money, finance terrorism, or engage in other illegal financial activities.</li>
                  <li>Acknowledge that we may be required to report suspicious activities to relevant authorities.</li>
                </ul>
                <p className='text-brand-dark/70 leading-relaxed mt-4'>
                  We reserve the right to suspend or terminate your account immediately, without prior notice, if we suspect any illegal activity or violation of these compliance requirements. We may also be required to freeze funds or disclose information to law enforcement agencies as required by law.
                </p>
              </section>

              <section className='mb-10'>
                <h2 className='font-display text-2xl font-bold uppercase text-brand-dark mb-4'>
                  11. Third-Party Services
                </h2>
                <p className='text-brand-dark/70 leading-relaxed mb-4'>Our Service relies on third-party providers including:</p>
                <ul className='list-disc pl-6 text-brand-dark/70 space-y-2'>
                  <li><strong>Meta (WhatsApp):</strong> For messaging services. Your use is also subject to WhatsApp&apos;s Terms of Service.</li>
                  <li><strong>Coinbase CDP:</strong> For account infrastructure and security management.</li>
                  <li><strong>Arbitrum Network:</strong> A public blockchain for transaction processing. On-chain data is publicly visible and immutable.</li>
                </ul>
                <p className='text-brand-dark/70 leading-relaxed mt-4'>
                  We are not responsible for the availability, performance, or conduct of third-party services.
                </p>
              </section>

              <section className='mb-10'>
                <h2 className='font-display text-2xl font-bold uppercase text-brand-dark mb-4'>
                  12. Limitation of Liability
                </h2>
                <p className='text-brand-dark/70 leading-relaxed mb-4'>To the maximum extent permitted by law:</p>
                <ul className='list-disc pl-6 text-brand-dark/70 space-y-2'>
                  <li>The Service is provided &ldquo;AS IS&rdquo; and &ldquo;AS AVAILABLE&rdquo; without warranties of any kind.</li>
                  <li>We are not liable for any direct, indirect, incidental, special, or consequential damages arising from your use of the Service.</li>
                  <li>We are not responsible for losses due to user error, including sending funds to incorrect phone numbers.</li>
                  <li>We are not liable for service interruptions caused by third-party providers or network issues.</li>
                </ul>
              </section>

              <section className='mb-10'>
                <h2 className='font-display text-2xl font-bold uppercase text-brand-dark mb-4'>
                  13. Indemnification
                </h2>
                <p className='text-brand-dark/70 leading-relaxed'>
                  You agree to indemnify and hold harmless Sippy, its operators, and affiliates from any claims, damages, losses, or expenses arising from your use of the Service, your violation of these Terms, or your violation of any rights of a third party.
                </p>
              </section>

              <section className='mb-10'>
                <h2 className='font-display text-2xl font-bold uppercase text-brand-dark mb-4'>
                  14. Termination and Suspension
                </h2>
                <p className='text-brand-dark/70 leading-relaxed mb-4'>
                  We may suspend or terminate your access to the Service at any time, without prior notice, for conduct that we believe:
                </p>
                <ul className='list-disc pl-6 text-brand-dark/70 space-y-2'>
                  <li>Violates these Terms or applicable laws.</li>
                  <li>Is harmful to other users, us, or third parties.</li>
                  <li>Is fraudulent or illegal.</li>
                  <li>Involves suspicious activity that may indicate money laundering or other financial crimes.</li>
                  <li>Exceeds transaction limits or triggers security alerts.</li>
                </ul>
                <p className='text-brand-dark/70 leading-relaxed mt-4'>
                  <strong>Suspension:</strong> During a suspension, your account will be temporarily disabled while we investigate. You will not be able to send or receive funds through Sippy during this period.
                </p>
                <p className='text-brand-dark/70 leading-relaxed mt-4'>
                  <strong>Termination:</strong> You may stop using the Service at any time. Upon termination, your funds remain on the Arbitrum network. To withdraw any remaining balance, please contact us at hello@sippy.lat with a withdrawal request including your phone number and a destination wallet address. We will process withdrawal requests within 15 business days.
                </p>
              </section>

              <section className='mb-10'>
                <h2 className='font-display text-2xl font-bold uppercase text-brand-dark mb-4'>
                  15. Disputes, Complaints, and Refunds
                </h2>
                <p className='text-brand-dark/70 leading-relaxed mb-4'>
                  If you have a complaint or dispute regarding our Service, please follow these steps:
                </p>
                <ul className='list-disc pl-6 text-brand-dark/70 space-y-2 mb-4'>
                  <li>
                    <strong>Contact Support:</strong> Email us at{' '}
                    <a href='mailto:hello@sippy.lat' className='text-brand-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary rounded'>hello@sippy.lat</a>{' '}
                    with subject line &ldquo;Complaint&rdquo; or &ldquo;Dispute&rdquo; and include your phone number, transaction details, and a description of the issue.
                  </li>
                  <li><strong>Response Time:</strong> We will acknowledge your complaint within 3 business days and aim to resolve it within 15 business days.</li>
                  <li><strong>Investigation:</strong> For transaction disputes, we will review transaction records and our system logs to investigate the issue.</li>
                </ul>
                <h3 className='font-display text-lg font-bold uppercase text-brand-dark mt-6 mb-3'>
                  Refunds and Transaction Errors
                </h3>
                <ul className='list-disc pl-6 text-brand-dark/70 space-y-2'>
                  <li><strong>Transactions are irreversible.</strong> Once confirmed, transactions cannot be reversed or refunded by Sippy.</li>
                  <li><strong>User error:</strong> Sippy is not responsible for funds sent to incorrect phone numbers. Please verify recipient details before confirming transactions.</li>
                  <li><strong>System errors:</strong> If a technical error on our part results in an incorrect transaction, we will work with you to resolve the issue to the extent possible.</li>
                </ul>
                <p className='text-brand-dark/70 leading-relaxed mt-4'>
                  If you are unsatisfied with our resolution, you may file a complaint with the Superintendencia de Industria y Comercio (SIC) in Colombia.
                </p>
              </section>

              <section className='mb-10'>
                <h2 className='font-display text-2xl font-bold uppercase text-brand-dark mb-4'>16. Modifications to Terms</h2>
                <p className='text-brand-dark/70 leading-relaxed'>
                  We reserve the right to modify these Terms at any time. We will notify users of material changes by posting the updated Terms on our website. Your continued use of the Service after changes become effective constitutes acceptance of the new Terms.
                </p>
              </section>

              <section className='mb-10'>
                <h2 className='font-display text-2xl font-bold uppercase text-brand-dark mb-4'>17. Governing Law</h2>
                <p className='text-brand-dark/70 leading-relaxed'>
                  These Terms shall be governed by and construed in accordance with the laws of the Republic of Colombia. Any disputes arising from these Terms or your use of the Service shall be subject to the exclusive jurisdiction of the courts of Colombia.
                </p>
              </section>

              <section className='mb-10'>
                <h2 className='font-display text-2xl font-bold uppercase text-brand-dark mb-4'>18. Severability</h2>
                <p className='text-brand-dark/70 leading-relaxed'>
                  If any provision of these Terms is found to be unenforceable or invalid, that provision shall be limited or eliminated to the minimum extent necessary, and the remaining provisions shall remain in full force and effect.
                </p>
              </section>

              <section className='mb-6'>
                <h2 className='font-display text-2xl font-bold uppercase text-brand-dark mb-4'>19. Contact Us</h2>
                <p className='text-brand-dark/70 leading-relaxed mb-4'>If you have any questions about these Terms, please contact us:</p>
                <div className='bg-brand-primary-light rounded-xl p-6 border border-brand-primary/20'>
                  <p className='text-brand-dark font-medium text-lg'>Sippy</p>
                  <p className='text-brand-dark/70 font-medium'>Company registration in progress</p>
                  <p className='text-gray-600 flex items-center gap-2 mt-3 pt-3 border-t border-brand-primary/20'>
                    <Mail className='w-4 h-4 text-brand-primary' />
                    <a href='mailto:hello@sippy.lat' className='text-brand-primary hover:underline font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary rounded'>hello@sippy.lat</a>
                  </p>
                  <p className='text-brand-dark/70 text-sm mt-3'>We will respond to your inquiry within 15 business days.</p>
                </div>
              </section>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className='border-t border-brand-dark/20 bg-white'>
        <div className='max-w-4xl mx-auto px-6 py-8'>
          <div className='flex flex-col md:flex-row justify-between items-center gap-4'>
            <div className='flex items-center gap-2'>
              <Image src='/images/logos/sippy-s-mark-cheetah.svg' alt='Sippy' width={20} height={20} />
              <p className='text-sm text-brand-dark/70'>&copy; {new Date().getFullYear()} Sippy. All rights reserved.</p>
            </div>
            <nav aria-label='Footer navigation' className='flex gap-6 text-sm text-brand-dark/70'>
              <Link href='/' className='hover:text-brand-primary transition-smooth font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary rounded'>Home</Link>
              <Link href='/privacy' className='hover:text-brand-primary transition-smooth font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary rounded'>Privacy Policy</Link>
              <Link href='/terms' className='text-brand-primary font-medium'>Terms of Service</Link>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}

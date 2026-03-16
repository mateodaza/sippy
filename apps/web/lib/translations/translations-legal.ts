/**
 * Legal page translations (Terms of Service + Privacy Policy)
 * English only — ES/PT translations require professional legal review.
 * The t() fallback in i18n.ts returns English for missing keys.
 */

export const legalTranslations: Record<string, string> = {
  // ── Terms of Service ─────────────────────────────────────────────────────

  'terms.title': 'Terms of Service',
  'terms.updated': 'Last updated: November 8, 2025',
  'terms.back': 'Back to Home',

  // Section 1
  'terms.s1.title': '1. Introduction',
  'terms.s1.p1':
    'Welcome to Sippy. These Terms of Service (\u201cTerms\u201d) govern your use of the Sippy service (\u201cService\u201d), a WhatsApp-based payment application that enables users to send and receive digital dollars using phone numbers.',
  'terms.s1.p2':
    'By using our Service, you agree to be bound by these Terms. If you do not agree to these Terms, please do not use our Service.',

  // Section 2
  'terms.s2.title': '2. Service Provider',
  'terms.s2.intro': 'The Service is provided by:',
  'terms.s2.name': 'Sippy',
  'terms.s2.registration': 'Company registration in progress',

  // Section 3
  'terms.s3.title': '3. Eligibility',
  'terms.s3.intro': 'To use our Service, you must:',
  'terms.s3.item1': 'Be at least 18 years of age.',
  'terms.s3.item2': 'Have a valid WhatsApp account with an active phone number.',
  'terms.s3.item3': 'Have the legal capacity to enter into a binding agreement.',
  'terms.s3.item4': 'Not be prohibited from using the Service under applicable laws.',

  // Section 4
  'terms.s4.title': '4. Description of Service',
  'terms.s4.intro': 'Sippy provides a WhatsApp-based interface for:',
  'terms.s4.item1': 'Creating a payment account linked to your phone number.',
  'terms.s4.item2': 'Sending and receiving digital dollars to other phone numbers.',
  'terms.s4.item3': 'Checking your balance.',
  'terms.s4.item4': 'Viewing your transaction history.',
  'terms.s4.footer':
    'Our Service uses Coinbase CDP (Coinbase Developer Platform) for secure account management and the Arbitrum network (a public blockchain) for payment processing. Transaction data on Arbitrum is publicly visible and permanently recorded.',

  // Section 5
  'terms.s5.title': '5. Account Creation and Security',
  'terms.s5.intro':
    'When you create an account by sending \u201cstart\u201d to our WhatsApp bot:',
  'terms.s5.item1':
    'A payment account is automatically created and linked to your phone number.',
  'terms.s5.item2':
    'Your account security keys are securely stored by Coinbase in their Trusted Execution Environment (TEE).',
  'terms.s5.item3':
    'You are responsible for maintaining the security of your WhatsApp account.',
  'terms.s5.item4':
    'You must notify us immediately if you suspect unauthorized access to your account.',

  // Section 6
  'terms.s6.title': '6. Transaction Limits and Fees',
  'terms.s6.intro': 'The following limits apply to your use of the Service:',
  'terms.s6.item1': 'Daily Limit: $500 USD equivalent per day.',
  'terms.s6.item2': 'Per Transaction Limit: $100 USD equivalent per transaction.',
  'terms.s6.item3': 'Transaction Fees: Sippy covers transaction fees during the beta period.',
  'terms.s6.footer':
    'These limits may be modified at our discretion. We will notify users of any changes.',

  // Section 7
  'terms.s7.title': '7. Acceptable Use',
  'terms.s7.intro': 'You agree NOT to use the Service for:',
  'terms.s7.item1': 'Any illegal activities or purposes.',
  'terms.s7.item2': 'Money laundering or terrorist financing.',
  'terms.s7.item3': 'Fraud or deceptive practices.',
  'terms.s7.item4': 'Circumventing transaction limits or security measures.',
  'terms.s7.item5': 'Spamming or sending unsolicited messages.',
  'terms.s7.item6':
    'Attempting to gain unauthorized access to our systems or other users\u2019 accounts.',
  'terms.s7.item7': 'Any activity that violates applicable laws or regulations.',
  'terms.s7.footer':
    'We reserve the right to suspend or terminate accounts that violate these terms.',

  // Section 8
  'terms.s8.title': '8. Transaction Risks',
  'terms.s8.intro':
    'By using our Service, you acknowledge and accept the following risks:',
  'terms.s8.item1':
    'Irreversible Transactions: Transactions are irreversible. Once a transaction is confirmed, it cannot be undone.',
  'terms.s8.item2':
    'Technology Risks: Digital payment systems are subject to technical issues, bugs, and security vulnerabilities.',
  'terms.s8.item3':
    'Regulatory Changes: Digital payment regulations may change, potentially affecting the Service.',
  'terms.s8.item4':
    'Network Delays: Transactions may be delayed during periods of high network activity.',

  // Section 9
  'terms.s9.title': '9. No Financial Advice',
  'terms.s9.body':
    'Sippy is a payment service and does not provide financial, investment, legal, or tax advice. The Service is not intended to be used for investment purposes. You should consult with qualified professionals before making any financial decisions.',

  // Section 10
  'terms.s10.title': '10. Compliance and Anti-Money Laundering',
  'terms.s10.intro':
    'Sippy is committed to complying with applicable anti-money laundering (AML) laws and regulations. By using our Service, you agree to:',
  'terms.s10.item1':
    'Use the Service only for lawful purposes and in compliance with all applicable laws.',
  'terms.s10.item2':
    'Provide accurate information when requested for verification purposes.',
  'terms.s10.item3':
    'Not use the Service to launder money, finance terrorism, or engage in other illegal financial activities.',
  'terms.s10.item4':
    'Acknowledge that we may be required to report suspicious activities to relevant authorities.',
  'terms.s10.footer':
    'We reserve the right to suspend or terminate your account immediately, without prior notice, if we suspect any illegal activity or violation of these compliance requirements. We may also be required to freeze funds or disclose information to law enforcement agencies as required by law.',

  // Section 11
  'terms.s11.title': '11. Third-Party Services',
  'terms.s11.intro': 'Our Service relies on third-party providers including:',
  'terms.s11.item1':
    'Meta (WhatsApp): For messaging services. Your use is also subject to WhatsApp\u2019s Terms of Service.',
  'terms.s11.item2':
    'Coinbase CDP: For account infrastructure and security management.',
  'terms.s11.item3':
    'Arbitrum Network: A public blockchain for transaction processing. On-chain data is publicly visible and immutable.',
  'terms.s11.footer':
    'We are not responsible for the availability, performance, or conduct of third-party services.',

  // Section 12
  'terms.s12.title': '12. Limitation of Liability',
  'terms.s12.intro': 'To the maximum extent permitted by law:',
  'terms.s12.item1':
    'The Service is provided \u201cAS IS\u201d and \u201cAS AVAILABLE\u201d without warranties of any kind.',
  'terms.s12.item2':
    'We are not liable for any direct, indirect, incidental, special, or consequential damages arising from your use of the Service.',
  'terms.s12.item3':
    'We are not responsible for losses due to user error, including sending funds to incorrect phone numbers.',
  'terms.s12.item4':
    'We are not liable for service interruptions caused by third-party providers or network issues.',

  // Section 13
  'terms.s13.title': '13. Indemnification',
  'terms.s13.body':
    'You agree to indemnify and hold harmless Sippy, its operators, and affiliates from any claims, damages, losses, or expenses arising from your use of the Service, your violation of these Terms, or your violation of any rights of a third party.',

  // Section 14
  'terms.s14.title': '14. Termination and Suspension',
  'terms.s14.intro':
    'We may suspend or terminate your access to the Service at any time, without prior notice, for conduct that we believe:',
  'terms.s14.item1': 'Violates these Terms or applicable laws.',
  'terms.s14.item2': 'Is harmful to other users, us, or third parties.',
  'terms.s14.item3': 'Is fraudulent or illegal.',
  'terms.s14.item4':
    'Involves suspicious activity that may indicate money laundering or other financial crimes.',
  'terms.s14.item5': 'Exceeds transaction limits or triggers security alerts.',
  'terms.s14.suspension':
    'Suspension: During a suspension, your account will be temporarily disabled while we investigate. You will not be able to send or receive funds through Sippy during this period.',
  'terms.s14.termination':
    'Termination: You may stop using the Service at any time. Upon termination, your funds remain on the Arbitrum network. To withdraw any remaining balance, please contact us at hello@sippy.lat with a withdrawal request including your phone number and a destination wallet address. We will process withdrawal requests within 15 business days.',

  // Section 15
  'terms.s15.title': '15. Disputes, Complaints, and Refunds',
  'terms.s15.intro':
    'If you have a complaint or dispute regarding our Service, please follow these steps:',
  'terms.s15.item1':
    'Contact Support: Email us at hello@sippy.lat with subject line \u201cComplaint\u201d or \u201cDispute\u201d and include your phone number, transaction details, and a description of the issue.',
  'terms.s15.item2':
    'Response Time: We will acknowledge your complaint within 3 business days and aim to resolve it within 15 business days.',
  'terms.s15.item3':
    'Investigation: For transaction disputes, we will review transaction records and our system logs to investigate the issue.',
  'terms.s15.refunds.title': 'Refunds and Transaction Errors',
  'terms.s15.refunds.item1':
    'Transactions are irreversible. Once confirmed, transactions cannot be reversed or refunded by Sippy.',
  'terms.s15.refunds.item2':
    'User error: Sippy is not responsible for funds sent to incorrect phone numbers. Please verify recipient details before confirming transactions.',
  'terms.s15.refunds.item3':
    'System errors: If a technical error on our part results in an incorrect transaction, we will work with you to resolve the issue to the extent possible.',
  'terms.s15.footer':
    'If you are unsatisfied with our resolution, you may file a complaint with the Superintendencia de Industria y Comercio (SIC) in Colombia.',

  // Section 16
  'terms.s16.title': '16. Modifications to Terms',
  'terms.s16.body':
    'We reserve the right to modify these Terms at any time. We will notify users of material changes by posting the updated Terms on our website. Your continued use of the Service after changes become effective constitutes acceptance of the new Terms.',

  // Section 17
  'terms.s17.title': '17. Governing Law',
  'terms.s17.body':
    'These Terms shall be governed by and construed in accordance with the laws of the Republic of Colombia. Any disputes arising from these Terms or your use of the Service shall be subject to the exclusive jurisdiction of the courts of Colombia.',

  // Section 18
  'terms.s18.title': '18. Severability',
  'terms.s18.body':
    'If any provision of these Terms is found to be unenforceable or invalid, that provision shall be limited or eliminated to the minimum extent necessary, and the remaining provisions shall remain in full force and effect.',

  // Section 19
  'terms.s19.title': '19. Contact Us',
  'terms.s19.intro':
    'If you have any questions about these Terms, please contact us:',
  'terms.s19.name': 'Sippy',
  'terms.s19.registration': 'Company registration in progress',
  'terms.s19.response': 'We will respond to your inquiry within 15 business days.',

  // ── Shared legal strings ─────────────────────────────────────────────────

  'legal.home': 'Home',
  'legal.privacyPolicy': 'Privacy Policy',
  'legal.termsOfService': 'Terms of Service',
  'legal.copyright': '\u00a9 {year} Sippy. All rights reserved.',

  // ── Privacy Policy ───────────────────────────────────────────────────────

  'privacy.title': 'Privacy Policy',
  'privacy.updated': 'Last updated: November 8, 2025',
  'privacy.back': 'Back to Home',

  // Section 1
  'privacy.s1.title': '1. Introduction',
  'privacy.s1.p1':
    'Welcome to Sippy (\u201cwe,\u201d \u201cour,\u201d or \u201cus\u201d). Sippy is a WhatsApp-based payment service that allows users to send and receive digital dollars using phone numbers. This Privacy Policy explains how we collect, use, disclose, and protect your information when you use our service.',
  'privacy.s1.p2':
    'By using Sippy, you agree to the collection and use of information in accordance with this policy. This policy complies with Colombian data protection laws (Ley 1581 de 2012) and applicable regulations.',

  // Section 2
  'privacy.s2.title': '2. Data Controller',
  'privacy.s2.intro':
    'The data controller responsible for your personal information is:',
  'privacy.s2.name': 'Sippy',
  'privacy.s2.registration': 'Company registration in progress',

  // Section 3
  'privacy.s3.title': '3. Information We Collect',
  'privacy.s3.intro':
    'We collect the following types of information when you use our service:',
  'privacy.s3.provided.title': '3.1 Information You Provide',
  'privacy.s3.provided.item1':
    'Phone Number: Your WhatsApp phone number, which serves as your account identifier and wallet address.',
  'privacy.s3.provided.item2':
    'Messages: The messages you send to our WhatsApp bot to execute commands (e.g., \u201csend $10 to +573001234567\u201d).',
  'privacy.s3.auto.title': '3.2 Information Collected Automatically',
  'privacy.s3.auto.item1':
    'Account Address: A unique payment address automatically generated and associated with your phone number.',
  'privacy.s3.auto.item2':
    'Transaction History: Records of dollar transfers you make or receive, stored on the Arbitrum network (a public blockchain).',
  'privacy.s3.auto.item3':
    'Account Activity: Timestamps of your last activity, daily transaction amounts for security limits.',

  // Section 4
  'privacy.s4.title': '4. Consent and Opt-In',
  'privacy.s4.intro':
    'By initiating a conversation with our WhatsApp bot (sending \u201cstart\u201d or any message), you:',
  'privacy.s4.item1':
    'Opt-in to receive messages: You consent to receive transactional messages, notifications, and responses from Sippy via WhatsApp.',
  'privacy.s4.item2':
    'Consent to data processing: You agree to the collection and processing of your data as described in this policy.',
  'privacy.s4.item3':
    'Acknowledge the service terms: You confirm that you have read and accept our Terms of Service.',
  'privacy.s4.footer':
    'You may withdraw your consent at any time by contacting us at hello@sippy.lat or by stopping interaction with our WhatsApp bot.',

  // Section 5
  'privacy.s5.title': '5. How We Use Your Information',
  'privacy.s5.intro':
    'We use the collected information for the following purposes:',
  'privacy.s5.item1':
    'Provide Services: To create and manage your wallet, process transactions, and respond to your commands.',
  'privacy.s5.item2':
    'Security: To enforce daily spending limits and detect fraudulent or unauthorized activity.',
  'privacy.s5.item3':
    'Communication: To send you transaction confirmations, notifications, and support messages via WhatsApp.',
  'privacy.s5.item4':
    'Service Improvement: To understand how our service is used and improve user experience.',
  'privacy.s5.item5':
    'Legal Compliance: To comply with applicable laws, regulations, and legal requests.',
  'privacy.s5.footer':
    'Important: We only use data obtained through WhatsApp for purposes reasonably necessary to provide our payment service. We do not use your data for marketing or share it with third parties for advertising purposes.',

  // Section 6
  'privacy.s6.title': '6. Information We Do NOT Collect',
  'privacy.s6.intro':
    'To protect your privacy and security, we do NOT collect or request:',
  'privacy.s6.item1': 'Bank account numbers or banking credentials',
  'privacy.s6.item2': 'Credit or debit card numbers',
  'privacy.s6.item3':
    'Government-issued identification numbers (c\u00e9dula, passport)',
  'privacy.s6.item4': 'Passwords or PINs',
  'privacy.s6.item5': 'Biometric data',
  'privacy.s6.footer':
    'Warning: Sippy will never ask you to share sensitive financial information through WhatsApp. If someone requests this information claiming to be Sippy, do not respond and report it to us immediately.',

  // Section 7
  'privacy.s7.title': '7. Third-Party Services',
  'privacy.s7.intro':
    'We use the following third-party services to provide our service:',
  'privacy.s7.item1':
    'Meta (WhatsApp Business API): To receive and send messages through WhatsApp. Your messages are processed through Meta\u2019s servers.',
  'privacy.s7.item2':
    'Coinbase (CDP - Coinbase Developer Platform): To securely create and manage payment accounts. Security keys are stored in Coinbase\u2019s secure infrastructure.',
  'privacy.s7.item3':
    'Arbitrum Network: To process dollar transactions. Arbitrum is a public blockchain, meaning transaction data (amounts, addresses, timestamps) is publicly visible and permanently recorded.',
  'privacy.s7.item4':
    'Blockscout: To retrieve transaction history and balance information.',
  'privacy.s7.item5':
    'Groq (optional): When enabled, your message text may be sent to Groq\u2019s AI service for natural language processing to understand your commands. This feature can be disabled.',

  // Section 8
  'privacy.s8.title': '8. Data Storage and Security',
  'privacy.s8.intro':
    'We implement appropriate security measures to protect your information:',
  'privacy.s8.item1':
    'Your wallet private keys are stored securely by Coinbase in their Trusted Execution Environment (TEE) and are never exposed to our servers.',
  'privacy.s8.item2':
    'Your phone number and wallet address are stored in a secure PostgreSQL database with encrypted connections (TLS).',
  'privacy.s8.item3':
    'Message handling: Message IDs are cached temporarily in memory for deduplication (approximately 2 minutes). Spam counters are maintained in memory and reset periodically. We do not permanently store message content in our database. However, server logs may include message content for operational purposes and may be retained by our hosting provider according to their data retention policies.',
  'privacy.s8.item4':
    'Transaction data is stored on the Arbitrum network (a public blockchain), which provides a permanent and publicly visible record.',

  // Section 9
  'privacy.s9.title': '9. Data Retention',
  'privacy.s9.intro':
    'We retain different types of data for different periods:',
  'privacy.s9.item1':
    'Account data (phone number, wallet address): Retained for as long as your account is active, or until you request deletion.',
  'privacy.s9.item2':
    'Activity data (last activity timestamp, daily spending counters): Retained in the database for as long as your account is active. Daily spending counters reset automatically each day.',
  'privacy.s9.item3':
    'Message cache (message IDs, spam counters): Stored in memory only, cleared on server restart or after short intervals (2 minutes for deduplication). Server logs containing message content may be retained by our hosting provider per their policies.',
  'privacy.s9.item4':
    'Payment transactions: Permanently stored on the Arbitrum network (a public blockchain). This data cannot be deleted due to the immutable nature of blockchain records.',
  'privacy.s9.deletion.title': 'Requesting Data Deletion',
  'privacy.s9.deletion.body':
    'To request deletion of your account and associated data, email us at hello@sippy.lat with subject line \u201cData Deletion Request\u201d and include the phone number associated with your account. We will process your request within 15 business days and confirm deletion via email. Note: Transaction records on the Arbitrum blockchain cannot be deleted due to the immutable nature of public blockchains.',

  // Section 10
  'privacy.s10.title': '10. Your Rights',
  'privacy.s10.intro':
    'Under Colombian data protection law (Ley 1581 de 2012), you have the following rights:',
  'privacy.s10.item1':
    'Right to Access: Request information about the personal data we hold about you.',
  'privacy.s10.item2':
    'Right to Rectification: Request correction of inaccurate or incomplete data.',
  'privacy.s10.item3':
    'Right to Deletion: Request deletion of your personal data, subject to legal retention requirements.',
  'privacy.s10.item4':
    'Right to Revoke Consent: Withdraw your consent for data processing at any time.',
  'privacy.s10.item5':
    'Right to Lodge a Complaint: File a complaint with the Superintendencia de Industria y Comercio (SIC) if you believe your rights have been violated.',
  'privacy.s10.footer':
    'To exercise any of these rights, please contact us at hello@sippy.lat.',

  // Section 11
  'privacy.s11.title': "11. Children's Privacy",
  'privacy.s11.body':
    'Our service is not intended for use by individuals under the age of 18. We do not knowingly collect personal information from children. If you are a parent or guardian and believe your child has provided us with personal information, please contact us at hello@sippy.lat so we can take appropriate action.',

  // Section 12
  'privacy.s12.title': '12. Changes to This Policy',
  'privacy.s12.body':
    'We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the \u201cLast updated\u201d date. We encourage you to review this Privacy Policy periodically for any changes.',

  // Section 13
  'privacy.s13.title': '13. Contact Us',
  'privacy.s13.intro':
    'If you have any questions about this Privacy Policy or our data practices, please contact us:',
  'privacy.s13.name': 'Sippy',
  'privacy.s13.registration': 'Company registration in progress',
  'privacy.s13.response': 'We will respond to your inquiry within 15 business days.',
};

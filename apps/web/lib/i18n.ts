/**
 * i18n — Language detection, storage, and translation utilities.
 *
 * Provides:
 *  - Language type + LANG_KEY constant
 *  - Translation table (TRANSLATIONS) for all UI strings
 *  - storeLanguage / getStoredLanguage / clearLanguage
 *  - detectLanguageFromPhone / fetchUserLanguage / resolveLanguage
 *  - localizeError (maps error codes + context → translated messages)
 *  - t (translation helper)
 *  - formatRelativeTime (localized, independent of blockscout.ts)
 */

import { getLanguageForPhone as _getLanguageForPhone } from '@sippy/shared'

// ── Types & constants ──────────────────────────────────────────────────────────

export type Language = 'en' | 'es' | 'pt'
export const LANG_KEY = 'sippy_lang'
const VALID_LANGUAGES: Language[] = ['en', 'es', 'pt']

// ── Translation table ──────────────────────────────────────────────────────────

const TRANSLATIONS: Record<Language, Record<string, string>> = {
  en: {
    // setup page
    'setup.loading': 'Checking your account...',
    'setup.configRequired': 'Configuration Required:',
    'setup.configInstruction': 'Set NEXT_PUBLIC_CDP_PROJECT_ID in your environment.',
    'setup.title': 'Set Up Your Wallet',
    'setup.subtitle': 'Enter your phone number to create your self-custodial wallet.',
    'setup.phonePlaceholder': '+573001234567',
    'setup.phoneFromWhatsapp': 'Phone number from your WhatsApp link',
    'setup.sendCode': 'Send Verification Code',
    'setup.sending': 'Sending...',
    'setup.enterCode': 'Enter Code',
    'setup.codeSentTo': 'We sent a 6-digit code to',
    'setup.codePlaceholder': '123456',
    'setup.verify': 'Verify',
    'setup.verifying': 'Verifying...',
    'setup.back': 'Back',
    'setup.emailTitle': 'Add a recovery email (recommended)',
    'setup.emailSubtitle': 'Helps you recover your wallet if you lose your phone.',
    'setup.emailPlaceholder': 'you@example.com',
    'setup.emailSendCode': 'Send code',
    'setup.emailSending': 'Sending...',
    'setup.emailCodeSentTo': 'Code sent to',
    'setup.emailCodePlaceholder': 'Enter 6-digit code',
    'setup.emailVerify': 'Verify',
    'setup.emailVerifying': 'Verifying...',
    'setup.emailVerified': 'Email verified',
    'setup.continuingSetup': 'Continuing setup...',
    'setup.skipEmail': 'Skip for now',
    'setup.tosTitle': 'Terms of Service',
    'setup.tosSubtitle': 'Please review and accept our Terms of Service to continue.',
    'setup.tosCheckbox': 'I accept the Terms of Service',
    'setup.tosLink': 'Read Terms of Service',
    'setup.tosContinue': 'Continue',
    'setup.tosRequired': 'You must accept the Terms of Service to continue.',
    'setup.spendTitle': 'Set Spending Limit',
    'setup.spendSubtitle':
      'Choose how much Sippy can send per day on your behalf. You can change this anytime.',
    'setup.recommended': '(Recommended)',
    'setup.customPrefix': 'Custom: $',
    'setup.perDay': '/day',
    'setup.whatThisMeans': 'What this means:',
    'setup.spendExplain': 'Sippy can send up to ${n} USDC per day',
    'setup.limitResets': 'Limit resets automatically every day - no re-setup needed',
    'setup.youOwnWallet': 'You own your wallet and keys',
    'setup.revokable': 'You can revoke or change this anytime',
    'setup.approve': 'Approve & Continue',
    'setup.approving': 'Approving...',
    'setup.preparingWallet': 'Preparing wallet...',
    'setup.fundingGas': 'Setting up gas for your first transaction...',
    'setup.allSet': "You're All Set!",
    'setup.walletReady': 'Your wallet is ready. Return to WhatsApp and start sending dollars!',
    'setup.yourWallet': 'Your wallet:',
    'setup.tryCommands': 'Try these commands:',
    'setup.cmdBalance': 'balance',
    'setup.cmdSend': 'send $XX to a friend',
    'setup.cmdHistory': 'history',
    'setup.poweredBy': 'Sippy — powered by Arbitrum',
    // error keys — critical: these must match existing test assertions
    'setup.errSendCode': 'Failed to send verification code',
    'setup.errVerify': 'Verification failed',
    'setup.errFundGas': 'Could not fund wallet with gas. Please try again later.',
    'setup.errPrepare': 'Failed to prepare wallet. Please try again.',
    'setup.errNoWallet': 'No wallet found. Please try again.',
    'setup.errSpenderNotConfigured': 'Sippy spender address not configured.',
    'setup.errPrepareTx': 'Could not prepare wallet for transaction. Please try again.',
    'setup.errRegisterPermission': 'Failed to register permission. Please try again.',
    'setup.errInsufficientEth':
      "Insufficient ETH for gas fees. Please wait a moment and try again - we're sending you some ETH.",
    'setup.errRefuelLimit':
      'You have changed your limit too many times today. Please try again tomorrow.',
    'setup.errCreatePermission': 'Failed to create permission',
    'setup.errRegisterWallet': 'Failed to register wallet',
    'setup.errSendEmailCode': 'Failed to send email code',
    'setup.errVerifyEmailCode': 'Failed to verify email code',
    'setup.emailLoginLink': 'Log in with email',
    'setup.emailLoginTitle': 'Log In With Email',
    'setup.emailLoginSubtitle': 'Enter the email linked to your account.',
    'setup.emailLoginSendCode': 'Send code',
    'setup.emailLoginSending': 'Sending...',
    'setup.emailLoginCodeSent': 'If this email is registered, you will receive a code.',
    'setup.emailLoginVerify': 'Verify',
    'setup.emailLoginVerifying': 'Verifying...',
    'setup.emailLoginBack': 'Back to phone login',
    'setup.errEmailLogin': 'Invalid or expired code',

    // wallet page
    'wallet.loading': 'Checking your session...',
    'wallet.configRequired': 'Configuration Required:',
    'wallet.configInstruction': 'Set NEXT_PUBLIC_CDP_PROJECT_ID in your environment.',
    'wallet.title': 'Sign In',
    'wallet.subtitle': 'Enter your phone number to access your wallet.',
    'wallet.phonePlaceholder': '+573001234567',
    'wallet.phoneFromWhatsapp': 'Phone number from your WhatsApp link',
    'wallet.sendCode': 'Send Verification Code',
    'wallet.sending': 'Sending...',
    'wallet.codeSentTo': 'We sent a 6-digit code to',
    'wallet.codePlaceholder': '123456',
    'wallet.verify': 'Verify',
    'wallet.verifying': 'Verifying...',
    'wallet.back': 'Back',
    'wallet.whatsappWallet': 'WhatsApp Wallet',
    'wallet.webWallet': 'Web Wallet',
    'wallet.walletAddress': 'Wallet Address',
    'wallet.copy': 'Copy',
    'wallet.send': 'Send',
    'wallet.sendFrom': 'Send From',
    'wallet.toLabel': 'To',
    'wallet.toLabelHint': 'Phone number or 0x address',
    'wallet.amountLabel': 'Amount (USDC)',
    'wallet.amountPlaceholder': '0.00',
    'wallet.max': 'Max',
    'wallet.review': 'Review',
    'wallet.sending_': 'Sending...',
    'wallet.to': 'To',
    'wallet.confirmSend': 'Confirm Send',
    'wallet.sendingProgress': 'Sending...',
    'wallet.sent': 'Sent!',
    'wallet.sentSuccess': 'Transaction submitted successfully.',
    'wallet.viewOnBlockscout': 'View on Blockscout',
    'wallet.sendAnother': 'Send Another',
    'wallet.txFailed': 'Transaction Failed',
    'wallet.retry': 'Try Again',
    'wallet.cancel': 'Cancel',
    'wallet.settings': 'Settings',
    'wallet.signOut': 'Sign Out',
    'wallet.poweredBy': 'Sippy — powered by Arbitrum',
    'wallet.errSendCode': 'Failed to send verification code',
    'wallet.errVerify': 'Verification failed',
    'wallet.errInvalidAmount': 'Enter a valid amount.',
    'wallet.errInsufficientBalance': 'Insufficient balance.',
    'wallet.errNotSippyUser': 'This phone number is not a Sippy user.',
    'wallet.errTooManyLookups': 'Too many lookups. Try again later.',
    'wallet.errResolvePhone': 'Could not resolve phone number.',
    'wallet.errInvalidInput': 'Enter a valid phone number or 0x address.',
    'wallet.errNetwork': 'Network error. Please try again.',
    'wallet.errSessionExpired': 'Session expired. Please sign in again.',
    'wallet.errNoWallet': 'No wallet found. Set up your wallet first at sippy.lat/setup',
    'wallet.errSendFailed': 'Send failed',
    'wallet.errTransactionFailed': 'Transaction failed.',

    // settings page
    'settings.loading': 'Checking your session...',
    'settings.configRequired': 'Configuration Required:',
    'settings.configInstruction': 'Set NEXT_PUBLIC_CDP_PROJECT_ID in your environment.',
    'settings.authTitle': 'Wallet Security',
    'settings.authSubtitle': 'Enter your phone number to manage your wallet.',
    'settings.phonePlaceholder': '+573001234567',
    'settings.phoneFromWhatsapp': 'Phone number from your WhatsApp link',
    'settings.sendCode': 'Send Verification Code',
    'settings.sending': 'Sending...',
    'settings.codeSentTo': 'We sent a 6-digit code to',
    'settings.codePlaceholder': '123456',
    'settings.verify': 'Verify',
    'settings.verifying': 'Verifying...',
    'settings.back': 'Back',
    // critical: must match existing test assertions
    'settings.title': 'Wallet Security',
    'settings.dailyLimit': 'Daily Limit',
    'settings.noLimitInfo': 'No limit info available.',
    'settings.limitLoadError': 'Could not load limit info.',
    'settings.emailVerified': 'Email verified',
    'settings.verifyEmailCta': 'Verify your email to unlock higher limits',
    'settings.unlockLimit': 'Unlock higher limits',
    'settings.currentLimit': 'Current limit',
    // critical: must match existing test assertions
    'settings.noPermission': 'No permission',
    'settings.changeLimitLabel': 'Change limit',
    'settings.recommended': '(Recommended)',
    'settings.customPrefix': 'Custom: $',
    'settings.perDay': '/day',
    'settings.maxLimit': 'Max',
    'settings.usedToday': 'Used today',
    'settings.remaining': 'remaining',
    'settings.updateLimit': 'Update Limit',
    'settings.updating': 'Updating...',
    'settings.updateSuccess': 'Limit updated!',
    'settings.upgradeLimitCta': 'Your email is verified! Upgrade your limit to',
    'settings.upgradeNow': 'Upgrade now',
    'settings.disableTitle': 'Disable Sippy',
    'settings.disableDesc': "This will revoke Sippy's permission to send on your behalf.",
    'settings.revokePermission': 'Revoke Permission',
    'settings.revoking': 'Revoking...',
    'settings.emailWarning':
      'Warning: You have a verified email. Revoking permission requires re-verification.',
    'settings.cancel': 'Cancel',
    'settings.continueAnyway': 'Continue Anyway',
    'settings.verifyIdentity': 'Verify Identity',
    'settings.emailSendCode': 'Send Code',
    'settings.emailSending': 'Sending...',
    'settings.emailCodeInstruction': 'Enter the code sent to your email',
    'settings.emailCodePlaceholder': '123456',
    'settings.emailVerifying': 'Verifying...',
    'settings.enableTitle': 'Enable Sippy',
    'settings.enableSippy': 'Enable Sippy',
    'settings.enabling': 'Enabling...',
    'settings.walletAddress': 'Wallet Address',
    'settings.recoveryEmail': 'Recovery Email',
    'settings.emailLoadError': 'Could not load email status.',
    'settings.emailLoadRetry': 'Retry',
    'settings.addEmailBanner': 'Add a recovery email to unlock higher spending limits',
    'settings.emailLabel': 'Email Address',
    'settings.emailPlaceholder': 'you@example.com',
    'settings.addEmailBtn': 'Add Email',
    'settings.emailCodeSentTo': 'Code sent to',
    'settings.emailCodeInput': 'Enter 6-digit code',
    'settings.emailVerifyBtn': 'Verify',
    'settings.resendCode': 'Resend code',
    'settings.emailNotVerified': 'Email not verified',
    'settings.emailEnterToVerify': 'Enter your email to verify it',
    'settings.walletSecurity': 'Wallet Security',
    'settings.exportKey': 'Backup Private Key',
    'settings.exportWarningTitle': 'Warning',
    'settings.exportWarningBody':
      'This is a backup of your signing key. Never share it. Sippy keeps working normally after export.',
    'settings.understandContinue': 'I understand, continue',
    'settings.loadingKey': 'Loading...',
    'settings.transferFirst': 'Transfer funds first',
    'settings.transferDesc':
      'Move your USDC to the export address before exporting. After transfer, these funds will only be accessible with the exported key, not through Sippy.',
    'settings.smartBalance': 'Wallet balance',
    'settings.transferTo': 'Transfer to export address',
    'settings.transferBtn': 'Transfer',
    'settings.skipShowKey': 'Skip and show key anyway',
    'settings.skipWarning':
      'If you skip, your funds stay in your Sippy wallet and remain accessible through the app.',
    'settings.transferring': 'Transferring...',
    'settings.movingFunds': 'Moving funds...',
    'settings.retryTransfer': 'Retry transfer',
    'settings.skipAnyway': 'Skip anyway',
    'settings.yourPrivateKey': 'Your Private Key',
    'settings.copyKey': 'Copy Key',
    'settings.copied': 'Copied!',
    'settings.done': 'Done',
    'settings.keyWillClear': 'Key will be cleared from memory when you leave this page.',
    'settings.noExportAccount': 'No account available for export.',
    'settings.openWallet': 'Open Wallet',
    'settings.signOut': 'Sign Out',
    'settings.poweredBy': 'Sippy — powered by Arbitrum',
    'settings.errGateRequired': 'Email verification required to continue.',
    'settings.errInvalidCode': 'Invalid or expired code.',
    'settings.errNoVerifiedEmail': 'No verified email on file.',
    'settings.errSweepFailed': 'Transfer failed. Please try again.',
    'settings.errExportFailed': 'Export failed. Please try again.',
    'settings.errSendOtp': 'Failed to send verification code',
    'settings.errVerifyOtp': 'Verification failed',
    'settings.errRevokeFailed': 'Failed to revoke permission.',
    'settings.errEnableFailed': 'Failed to enable permission.',
    'settings.errSendEmailCode': 'Failed to send email code',
    'settings.errVerifyEmailCode': 'Failed to verify email code',
    'settings.errGeneric': 'Something went wrong. Please try again.',
    'settings.languageTitle': 'Language',
    'settings.langEn': 'English',
    'settings.langEs': 'Español',
    'settings.langPt': 'Português',
    'settings.langAuto': 'Auto-detect',
    'settings.langSaveError': 'Failed to save language preference',

    // activity component
    'activity.noActivity': 'No recent activity yet',
    'activity.willAppear': 'Transactions will appear here',
    'activity.recentActivity': 'Recent Activity',
    'activity.last10': 'Last 10 transactions',
    'activity.pending': 'Pending',
    'activity.failed': 'Failed',
    'activity.to': 'To: ',
    'activity.from': 'From: ',
    'activity.address': 'Address: ',
    'activity.sent': 'sent',
    'activity.received': 'received',
    'activity.transaction': 'transaction',
    'activity.viewReceipt': 'Click to view receipt',

    // time formatting
    'time.justNow': 'Just now',
    'time.mAgo': '{n}m ago',
    'time.hAgo': '{n}h ago',
    'time.dAgo': '{n}d ago',
    // landing page
    'landing.skip': 'Skip to content',
    'landing.nav.tryIt': 'Try it',
    'landing.nav.openWhatsapp': 'Open WhatsApp',
    'landing.status.online': 'ONLINE',
    'landing.hero.line1': 'just text',
    'landing.hero.line2': 'the money.',
    'landing.hero.sub1': 'digital dollars over WhatsApp.',
    'landing.hero.sub2': 'no downloads. simple chat interface.',
    'landing.hero.openWhatsapp': 'Open WhatsApp',
    'landing.hero.fundPhone': 'Fund a Phone',
    'landing.tags.1': 'ARBITRUM ONE',
    'landing.tags.2': 'USDC SETTLEMENT',
    'landing.tags.3': 'LATAM-FIRST',
    'landing.tags.4': '2026',
    'landing.marquee.1': 'Banks take days',
    'landing.marquee.2': 'Transfers cost too much',
    'landing.marquee.3': 'Apps require downloads',
    'landing.marquee.4': 'Passwords get forgotten',
    'landing.process.label': 'The Process',
    'landing.process.title': 'How It Works',
    'landing.step1.num': '01',
    'landing.step1.title': 'Message Sippy',
    'landing.step1.desc': 'Open WhatsApp and say hi. No app to download, no bank to visit.',
    'landing.step2.num': '02',
    'landing.step2.title': 'Connect or receive USDC',
    'landing.step2.desc': 'Use your wallet or receive funds directly to your number.',
    'landing.step3.num': '03',
    'landing.step3.title': 'Send to anyone',
    'landing.step3.desc':
      'Text an amount and a phone number. They receive digital dollars instantly.',
    'landing.step1.desc.desktop':
      'Open WhatsApp and say hi.\nNo app to download, no bank to visit.',
    'landing.step2.desc.desktop': 'Use your wallet or receive funds\ndirectly to your number.',
    'landing.step3.desc.desktop':
      'Text an amount and a phone number.\nThey receive digital dollars instantly.',
    'landing.step3.note':
      'Non-custodial wallets linked to phone numbers.\nFast settlement on Arbitrum. No app required.',
    'landing.hood.title': 'Under the Hood',
    'landing.hood.desc': 'Built on robust blockchain infrastructure for security and speed.',
    'landing.spec1.title': 'USDC Native',
    'landing.spec1.desc':
      'Transactions settle in USDC, a widely used stablecoin on blockchain. Transparent, audited, and liquid.',
    'landing.spec1.tag1': 'AUTO // SETTLE',
    'landing.spec1.tag2': 'STABLE // USDC',
    'landing.spec2.title': 'Arbitrum L2 Speed',
    'landing.spec2.desc': 'Fast transaction finality and low fees on Arbitrum.',
    'landing.spec3.title': 'Non-Custodial',
    'landing.spec3.desc': "Sippy doesn't custody funds. You control your wallet and your keys.",
    'landing.spec4.title': 'Natural Language',
    'landing.spec4.desc': 'Text what you need in your own words. Sippy understands how you talk.',
    'landing.everyone.title': 'Built for Everyone',
    'landing.everyone.label': 'USE CASES',
    'landing.everyone.desc': 'One message to move money. No bank, no app, no borders.',
    'landing.pill.1': 'Peer Payments',
    'landing.pill.2': 'Freelancer Pay',
    'landing.pill.3': 'Splitting Bills',
    'landing.pill.4': 'Micro-transactions',
    'landing.pill.5': 'Global Payments',
    'landing.pill.6': 'Save in Dollars',
    'landing.crt.footer': "whatsapp this number. that's it.",
    'landing.cta.label': 'GET STARTED',
    'landing.cta.title': 'Get Started',
    'landing.cta.desc': 'Open WhatsApp, say hi, and start moving money in seconds.',
    'landing.cta.button': 'Start on WhatsApp',
    'landing.cta.trust': 'non-custodial \u00b7 you control your funds',
    'landing.footer.desc': 'WhatsApp interface to send and receive USDC\nin Latin America',
    'landing.footer.features': '/features',
    'landing.footer.fund': '/fund',
    'landing.footer.about': '/about',
    'landing.footer.support': '/support',
    'landing.footer.docs': '/docs',
    'landing.footer.contact': '/contact',
    'landing.readout.1.label': 'Network',
    'landing.readout.1.value': 'Arbitrum One',
    'landing.readout.2.label': 'Settlement',
    'landing.readout.2.value': 'USDC',
    'landing.readout.3.label': 'Custody',
    'landing.readout.3.value': 'Non-custodial',
    'landing.readout.4.label': 'Interface',
    'landing.readout.4.value': 'WhatsApp',
    'landing.footer.copyright': '\u00a9 2026 Sippy',
    'landing.footer.terms': 'Terms',
    'landing.footer.privacy': 'Privacy',
    'landing.footer.version': 'v0.1.0 // LATAM // 2026',
    'landing.footer.disclaimer': 'Sippy is not affiliated with WhatsApp or Meta Platforms.',
    'landing.footer.legal':
      'Sippy is an interface for interacting with blockchain wallets. It does not custody funds or offer regulated financial services. The use of stablecoins involves risks.',

    // about page
    'about.badge.live': 'Live on Arbitrum One',
    'about.badge.launch': 'Launching Q2 2026',
    'about.hero.title.line1': 'The dollar wallet',
    'about.hero.title.line2': 'for Latin America',
    'about.hero.desc':
      'Sippy turns WhatsApp into a USDC wallet on Arbitrum One so you can send, receive, and hold dollars through messages without downloading an app, managing seed phrases, or learning anything about crypto.',
    'about.how.title.before': 'How it',
    'about.how.title.accent': 'works',
    'about.step1.title': 'Create wallet',
    'about.step1.desc': 'SMS verification. 30 seconds. You get your own smart wallet.',
    'about.step2.title': 'Fund wallet',
    'about.step2.desc': 'Buy USDC with local currency. Funds land directly in your wallet.',
    'about.step3.title': 'Send money',
    'about.step3.desc':
      'Type \u201csend $20 to +573001234567\u201d on WhatsApp. Arrives in seconds.',
    'about.thesis.title.before': 'Why this',
    'about.thesis.title.accent': 'matters',
    'about.thesis':
      'WhatsApp has 90%+ penetration across Latin America. Hundreds of millions of people open it before breakfast, and most of them want dollar stability because local currencies keep losing value. But nobody is downloading a new app to get it. Sippy puts a dollar wallet inside the app they already use, powered by an AI agent that speaks their language.',
    'about.arch.title': 'Architecture',
    'about.arch.subtitle': 'WhatsApp message in, on-chain transaction out',
    'about.arch1.title': 'WhatsApp Business API',
    'about.arch1.desc': 'User interface via Meta Cloud API',
    'about.arch2.title': 'Coinbase CDP Wallets',
    'about.arch2.desc': 'Non-custodial embedded smart accounts',
    'about.arch3.title': 'AI Agent',
    'about.arch3.desc': 'AI-powered payments in Spanish, English, and Portuguese',
    'about.arch4.title': 'USDC on Arbitrum One',
    'about.arch4.desc': 'Stable, regulated, deep liquidity',
    'about.arch5.title': 'Arbitrum One',
    'about.arch5.desc': 'Low-cost settlement, ~$0.01 per transaction',
    'about.arch6.title': 'GasRefuel.sol',
    'about.arch6.desc': 'Gasless transactions for users',
    'about.trust.title.before': 'Trust &',
    'about.trust.title.accent': 'Security',
    'about.trust.desc':
      'Users own their wallets. Sippy operates through spend permissions that users set and can revoke at any time.',
    'about.pillar1.title': 'Non-custodial',
    'about.pillar1.desc':
      'Coinbase CDP Embedded Wallets. Users control their own smart accounts and can export their private keys.',
    'about.pillar2.title': 'User-controlled limits',
    'about.pillar2.desc':
      'Daily spend limits enforced on-chain via SpendPermissionManager. Users set and revoke these anytime.',
    'about.pillar3.title': 'Fully transparent',
    'about.pillar3.desc':
      'Every transaction is verifiable on Arbiscan. Amount, recipient, timestamp, all on-chain.',
    'about.traction.title': 'Traction',
    'about.traction1.title': 'ETHOnline 2025 Finalist',
    'about.traction1.desc': 'Selected from hundreds of submissions at ETHGlobal.',
    'about.traction1.link': 'View showcase',
    'about.traction2.title': 'Arbitrum Grants Program',
    'about.traction2.desc': 'Funded through Arbitrum New Protocols and Ideas 3.0 via Questbook.',
    'about.traction3.title': 'Live on mainnet',
    'about.traction3.desc':
      'Smart contracts deployed and operational on Arbitrum One. End-to-end payment flow validated.',
    'about.cta.title': 'Money as fast as your\u00a0messages.',
    'about.cta.sub1': 'Launching Q2 2026 in Colombia.',
    'about.cta.sub2': 'Built to scale across Latin America.',
    'about.cta.contact': 'Get in touch',
    'about.cta.showcase': 'ETHGlobal Showcase',
    'about.footer.home': 'Home',
    'about.footer.privacy': 'Privacy Policy',
    'about.footer.terms': 'Terms of Service',
    'about.footer.contact': 'Contact',
    'about.footer.built': 'Built on Arbitrum One',

    // ── Legal: Terms of Service ────────────────────────────────────────────
    'terms.title': 'Terms of Service',
    'terms.updated': 'Last updated: November 8, 2025',
    'terms.back': 'Back to Home',
    'terms.s1.title': '1. Introduction',
    'terms.s1.p1':
      'Welcome to Sippy. These Terms of Service (\u201cTerms\u201d) govern your use of the Sippy service (\u201cService\u201d), a WhatsApp-based payment application that enables users to send and receive digital dollars using phone numbers.',
    'terms.s1.p2':
      'By using our Service, you agree to be bound by these Terms. If you do not agree to these Terms, please do not use our Service.',
    'terms.s2.title': '2. Service Provider',
    'terms.s2.intro': 'The Service is provided by:',
    'terms.s2.name': 'Sippy',
    'terms.s2.registration': 'Company registration in progress',
    'terms.s3.title': '3. Eligibility',
    'terms.s3.intro': 'To use our Service, you must:',
    'terms.s3.item1': 'Be at least 18 years of age.',
    'terms.s3.item2': 'Have a valid WhatsApp account with an active phone number.',
    'terms.s3.item3': 'Have the legal capacity to enter into a binding agreement.',
    'terms.s3.item4': 'Not be prohibited from using the Service under applicable laws.',
    'terms.s4.title': '4. Description of Service',
    'terms.s4.intro': 'Sippy provides a WhatsApp-based interface for:',
    'terms.s4.item1': 'Creating a payment account linked to your phone number.',
    'terms.s4.item2': 'Sending and receiving digital dollars to other phone numbers.',
    'terms.s4.item3': 'Checking your balance.',
    'terms.s4.item4': 'Viewing your transaction history.',
    'terms.s4.footer':
      'Our Service uses Coinbase CDP (Coinbase Developer Platform) for secure account management and the Arbitrum network (a public blockchain) for payment processing. Transaction data on Arbitrum is publicly visible and permanently recorded.',
    'terms.s5.title': '5. Account Creation and Security',
    'terms.s5.intro':
      'When you create an account by sending \u201cstart\u201d to our WhatsApp bot:',
    'terms.s5.item1': 'A payment account is automatically created and linked to your phone number.',
    'terms.s5.item2':
      'Your account security keys are securely stored by Coinbase in their Trusted Execution Environment (TEE).',
    'terms.s5.item3': 'You are responsible for maintaining the security of your WhatsApp account.',
    'terms.s5.item4':
      'You must notify us immediately if you suspect unauthorized access to your account.',
    'terms.s6.title': '6. Transaction Limits and Fees',
    'terms.s6.intro': 'The following limits apply to your use of the Service:',
    'terms.s6.item1': 'Daily Limit: $500 USD equivalent per day.',
    'terms.s6.item2': 'Per Transaction Limit: $100 USD equivalent per transaction.',
    'terms.s6.item3': 'Transaction Fees: Sippy covers transaction fees during the beta period.',
    'terms.s6.footer':
      'These limits may be modified at our discretion. We will notify users of any changes.',
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
    'terms.s8.title': '8. Transaction Risks',
    'terms.s8.intro': 'By using our Service, you acknowledge and accept the following risks:',
    'terms.s8.item1':
      'Irreversible Transactions: Transactions are irreversible. Once a transaction is confirmed, it cannot be undone.',
    'terms.s8.item2':
      'Technology Risks: Digital payment systems are subject to technical issues, bugs, and security vulnerabilities.',
    'terms.s8.item3':
      'Regulatory Changes: Digital payment regulations may change, potentially affecting the Service.',
    'terms.s8.item4':
      'Network Delays: Transactions may be delayed during periods of high network activity.',
    'terms.s9.title': '9. No Financial Advice',
    'terms.s9.body':
      'Sippy is a payment service and does not provide financial, investment, legal, or tax advice. The Service is not intended to be used for investment purposes. You should consult with qualified professionals before making any financial decisions.',
    'terms.s10.title': '10. Compliance and Anti-Money Laundering',
    'terms.s10.intro':
      'Sippy is committed to complying with applicable anti-money laundering (AML) laws and regulations. By using our Service, you agree to:',
    'terms.s10.item1':
      'Use the Service only for lawful purposes and in compliance with all applicable laws.',
    'terms.s10.item2': 'Provide accurate information when requested for verification purposes.',
    'terms.s10.item3':
      'Not use the Service to launder money, finance terrorism, or engage in other illegal financial activities.',
    'terms.s10.item4':
      'Acknowledge that we may be required to report suspicious activities to relevant authorities.',
    'terms.s10.footer':
      'We reserve the right to suspend or terminate your account immediately, without prior notice, if we suspect any illegal activity or violation of these compliance requirements. We may also be required to freeze funds or disclose information to law enforcement agencies as required by law.',
    'terms.s11.title': '11. Third-Party Services',
    'terms.s11.intro': 'Our Service relies on third-party providers including:',
    'terms.s11.item1':
      'Meta (WhatsApp): For messaging services. Your use is also subject to WhatsApp\u2019s Terms of Service.',
    'terms.s11.item2': 'Coinbase CDP: For account infrastructure and security management.',
    'terms.s11.item3':
      'Arbitrum Network: A public blockchain for transaction processing. On-chain data is publicly visible and immutable.',
    'terms.s11.footer':
      'We are not responsible for the availability, performance, or conduct of third-party services.',
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
    'terms.s13.title': '13. Indemnification',
    'terms.s13.body':
      'You agree to indemnify and hold harmless Sippy, its operators, and affiliates from any claims, damages, losses, or expenses arising from your use of the Service, your violation of these Terms, or your violation of any rights of a third party.',
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
    'terms.s16.title': '16. Modifications to Terms',
    'terms.s16.body':
      'We reserve the right to modify these Terms at any time. We will notify users of material changes by posting the updated Terms on our website. Your continued use of the Service after changes become effective constitutes acceptance of the new Terms.',
    'terms.s17.title': '17. Governing Law',
    'terms.s17.body':
      'These Terms shall be governed by and construed in accordance with the laws of the Republic of Colombia. Any disputes arising from these Terms or your use of the Service shall be subject to the exclusive jurisdiction of the courts of Colombia.',
    'terms.s18.title': '18. Severability',
    'terms.s18.body':
      'If any provision of these Terms is found to be unenforceable or invalid, that provision shall be limited or eliminated to the minimum extent necessary, and the remaining provisions shall remain in full force and effect.',
    'terms.s19.title': '19. Contact Us',
    'terms.s19.intro': 'If you have any questions about these Terms, please contact us:',
    'terms.s19.name': 'Sippy',
    'terms.s19.registration': 'Company registration in progress',
    'terms.s19.response': 'We will respond to your inquiry within 15 business days.',

    // ── Legal: Shared ──────────────────────────────────────────────────────
    'legal.home': 'Home',
    'legal.privacyPolicy': 'Privacy Policy',
    'legal.termsOfService': 'Terms of Service',
    'legal.copyright': '\u00a9 {year} Sippy. All rights reserved.',

    // ── Legal: Privacy Policy ──────────────────────────────────────────────
    'privacy.title': 'Privacy Policy',
    'privacy.updated': 'Last updated: November 8, 2025',
    'privacy.back': 'Back to Home',
    'privacy.s1.title': '1. Introduction',
    'privacy.s1.p1':
      'Welcome to Sippy (\u201cwe,\u201d \u201cour,\u201d or \u201cus\u201d). Sippy is a WhatsApp-based payment service that allows users to send and receive digital dollars using phone numbers. This Privacy Policy explains how we collect, use, disclose, and protect your information when you use our service.',
    'privacy.s1.p2':
      'By using Sippy, you agree to the collection and use of information in accordance with this policy. This policy complies with Colombian data protection laws (Ley 1581 de 2012) and applicable regulations.',
    'privacy.s2.title': '2. Data Controller',
    'privacy.s2.intro': 'The data controller responsible for your personal information is:',
    'privacy.s2.name': 'Sippy',
    'privacy.s2.registration': 'Company registration in progress',
    'privacy.s3.title': '3. Information We Collect',
    'privacy.s3.intro': 'We collect the following types of information when you use our service:',
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
    'privacy.s5.title': '5. How We Use Your Information',
    'privacy.s5.intro': 'We use the collected information for the following purposes:',
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
    'privacy.s6.title': '6. Information We Do NOT Collect',
    'privacy.s6.intro': 'To protect your privacy and security, we do NOT collect or request:',
    'privacy.s6.item1': 'Bank account numbers or banking credentials',
    'privacy.s6.item2': 'Credit or debit card numbers',
    'privacy.s6.item3': 'Government-issued identification numbers (c\u00e9dula, passport)',
    'privacy.s6.item4': 'Passwords or PINs',
    'privacy.s6.item5': 'Biometric data',
    'privacy.s6.footer':
      'Warning: Sippy will never ask you to share sensitive financial information through WhatsApp. If someone requests this information claiming to be Sippy, do not respond and report it to us immediately.',
    'privacy.s7.title': '7. Third-Party Services',
    'privacy.s7.intro': 'We use the following third-party services to provide our service:',
    'privacy.s7.item1':
      'Meta (WhatsApp Business API): To receive and send messages through WhatsApp. Your messages are processed through Meta\u2019s servers.',
    'privacy.s7.item2':
      'Coinbase (CDP - Coinbase Developer Platform): To securely create and manage payment accounts. Security keys are stored in Coinbase\u2019s secure infrastructure.',
    'privacy.s7.item3':
      'Arbitrum Network: To process dollar transactions. Arbitrum is a public blockchain, meaning transaction data (amounts, addresses, timestamps) is publicly visible and permanently recorded.',
    'privacy.s7.item4': 'Blockscout: To retrieve transaction history and balance information.',
    'privacy.s7.item5':
      'Groq (optional): When enabled, your message text may be sent to Groq\u2019s AI service for natural language processing to understand your commands. This feature can be disabled.',
    'privacy.s8.title': '8. Data Storage and Security',
    'privacy.s8.intro': 'We implement appropriate security measures to protect your information:',
    'privacy.s8.item1':
      'Your wallet private keys are stored securely by Coinbase in their Trusted Execution Environment (TEE) and are never exposed to our servers.',
    'privacy.s8.item2':
      'Your phone number and wallet address are stored in a secure PostgreSQL database with encrypted connections (TLS).',
    'privacy.s8.item3':
      'Message handling: Message IDs are cached temporarily in memory for deduplication (approximately 2 minutes). Spam counters are maintained in memory and reset periodically. We do not permanently store message content in our database. However, server logs may include message content for operational purposes and may be retained by our hosting provider according to their data retention policies.',
    'privacy.s8.item4':
      'Transaction data is stored on the Arbitrum network (a public blockchain), which provides a permanent and publicly visible record.',
    'privacy.s9.title': '9. Data Retention',
    'privacy.s9.intro': 'We retain different types of data for different periods:',
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
    'privacy.s10.footer': 'To exercise any of these rights, please contact us at hello@sippy.lat.',
    'privacy.s11.title': "11. Children's Privacy",
    'privacy.s11.body':
      'Our service is not intended for use by individuals under the age of 18. We do not knowingly collect personal information from children. If you are a parent or guardian and believe your child has provided us with personal information, please contact us at hello@sippy.lat so we can take appropriate action.',
    'privacy.s12.title': '12. Changes to This Policy',
    'privacy.s12.body':
      'We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the \u201cLast updated\u201d date. We encourage you to review this Privacy Policy periodically for any changes.',
    'privacy.s13.title': '13. Contact Us',
    'privacy.s13.intro':
      'If you have any questions about this Privacy Policy or our data practices, please contact us:',
    'privacy.s13.name': 'Sippy',
    'privacy.s13.registration': 'Company registration in progress',
    'privacy.s13.response': 'We will respond to your inquiry within 15 business days.',

    // support
    'support.title': 'Need Help?',
    'support.subtitle': 'Submit a request and we\u2019ll respond via email.',
    'support.email': 'Your email',
    'support.subject': 'Subject',
    'support.subjectPlaceholder': 'Brief summary of your issue',
    'support.category': 'Category',
    'support.category.general': 'General',
    'support.category.payments': 'Payments',
    'support.category.account': 'Account',
    'support.category.other': 'Other',
    'support.description': 'Description',
    'support.descriptionPlaceholder': 'Tell us more about your issue...',
    'support.minChars': 'min 20 characters',
    'support.submit': 'Send',
    'support.submitting': 'Sending...',
    'support.success.title': 'Ticket created!',
    'support.success.message': 'Ticket #{number} \u2014 we\u2019ll respond to your email.',
    'support.newTicket': 'Submit another request',
    'support.emailVerified': 'verified',
    'support.verifyEmailFirst':
      'Verify your email in Settings to submit support tickets. You can also reach us from the landing page.',
    'support.error': 'Something went wrong. Please try again.',
    'support.backHome': 'Back to home',
  },
  es: {
    // setup page
    'setup.loading': 'Verificando tu cuenta...',
    'setup.configRequired': 'Configuración requerida:',
    'setup.configInstruction': 'Establece NEXT_PUBLIC_CDP_PROJECT_ID en tu entorno.',
    'setup.title': 'Configura tu Billetera',
    'setup.subtitle': 'Ingresa tu número de teléfono para crear tu billetera autocustodiada.',
    'setup.phonePlaceholder': '+573001234567',
    'setup.phoneFromWhatsapp': 'Número de teléfono de tu enlace de WhatsApp',
    'setup.sendCode': 'Enviar Código de Verificación',
    'setup.sending': 'Enviando...',
    'setup.enterCode': 'Ingresa el Código',
    'setup.codeSentTo': 'Te enviamos un código de 6 dígitos a',
    'setup.codePlaceholder': '123456',
    'setup.verify': 'Verificar',
    'setup.verifying': 'Verificando...',
    'setup.back': 'Atrás',
    'setup.emailTitle': 'Agrega un correo de recuperación (recomendado)',
    'setup.emailSubtitle': 'Te ayuda a recuperar tu billetera si pierdes tu teléfono.',
    'setup.emailPlaceholder': 'tu@ejemplo.com',
    'setup.emailSendCode': 'Enviar código',
    'setup.emailSending': 'Enviando...',
    'setup.emailCodeSentTo': 'Código enviado a',
    'setup.emailCodePlaceholder': 'Ingresa el código de 6 dígitos',
    'setup.emailVerify': 'Verificar',
    'setup.emailVerifying': 'Verificando...',
    'setup.emailVerified': 'Correo verificado',
    'setup.continuingSetup': 'Continuando configuración...',
    'setup.skipEmail': 'Omitir por ahora',
    'setup.tosTitle': 'Términos de Servicio',
    'setup.tosSubtitle': 'Revisa y acepta nuestros Términos de Servicio para continuar.',
    'setup.tosCheckbox': 'Acepto los Términos de Servicio',
    'setup.tosLink': 'Leer Términos de Servicio',
    'setup.tosContinue': 'Continuar',
    'setup.tosRequired': 'Debes aceptar los Términos de Servicio para continuar.',
    'setup.spendTitle': 'Establecer Límite de Gasto',
    'setup.spendSubtitle':
      'Elige cuánto puede enviar Sippy por día en tu nombre. Puedes cambiarlo en cualquier momento.',
    'setup.recommended': '(Recomendado)',
    'setup.customPrefix': 'Personalizado: $',
    'setup.perDay': '/día',
    'setup.whatThisMeans': 'Qué significa esto:',
    'setup.spendExplain': 'Sippy puede enviar hasta ${n} USDC por día',
    'setup.limitResets': 'El límite se restablece automáticamente cada día',
    'setup.youOwnWallet': 'Tú eres dueño de tu billetera y tus claves',
    'setup.revokable': 'Puedes revocar o cambiar esto en cualquier momento',
    'setup.approve': 'Aprobar y Continuar',
    'setup.approving': 'Aprobando...',
    'setup.preparingWallet': 'Preparando billetera...',
    'setup.fundingGas': 'Configurando gas para tu primera transacción...',
    'setup.allSet': '¡Todo Listo!',
    'setup.walletReady': 'Tu billetera está lista. ¡Vuelve a WhatsApp y empieza a enviar dólares!',
    'setup.yourWallet': 'Tu billetera:',
    'setup.tryCommands': 'Prueba estos comandos:',
    'setup.cmdBalance': 'balance',
    'setup.cmdSend': 'enviar $XX a un amigo',
    'setup.cmdHistory': 'historial',
    'setup.poweredBy': 'Sippy — powered by Arbitrum',
    'setup.errSendCode': 'No se pudo enviar el código de verificación',
    'setup.errVerify': 'Verificación fallida',
    'setup.errFundGas': 'No se pudo financiar la billetera con gas. Intenta más tarde.',
    'setup.errPrepare': 'No se pudo preparar la billetera. Intenta de nuevo.',
    'setup.errNoWallet': 'No se encontró billetera. Intenta de nuevo.',
    'setup.errSpenderNotConfigured': 'Dirección del gastador Sippy no configurada.',
    'setup.errPrepareTx': 'No se pudo preparar la billetera para la transacción. Intenta de nuevo.',
    'setup.errRegisterPermission': 'No se pudo registrar el permiso. Intenta de nuevo.',
    'setup.errInsufficientEth':
      'ETH insuficiente para comisiones de gas. Espera un momento e intenta de nuevo.',
    'setup.errRefuelLimit': 'Cambiaste tu límite demasiadas veces hoy. Intenta de nuevo mañana.',
    'setup.errCreatePermission': 'No se pudo crear el permiso',
    'setup.errRegisterWallet': 'No se pudo registrar la billetera',
    'setup.errSendEmailCode': 'No se pudo enviar el código de correo',
    'setup.errVerifyEmailCode': 'No se pudo verificar el código de correo',
    'setup.emailLoginLink': 'Iniciar sesión con correo',
    'setup.emailLoginTitle': 'Iniciar sesión con correo',
    'setup.emailLoginSubtitle': 'Ingresa el correo vinculado a tu cuenta.',
    'setup.emailLoginSendCode': 'Enviar código',
    'setup.emailLoginSending': 'Enviando...',
    'setup.emailLoginCodeSent': 'Si este correo está registrado, recibirás un código.',
    'setup.emailLoginVerify': 'Verificar',
    'setup.emailLoginVerifying': 'Verificando...',
    'setup.emailLoginBack': 'Volver a inicio con teléfono',
    'setup.errEmailLogin': 'Código inválido o expirado',

    // wallet page
    'wallet.loading': 'Verificando tu sesión...',
    'wallet.configRequired': 'Configuración requerida:',
    'wallet.configInstruction': 'Establece NEXT_PUBLIC_CDP_PROJECT_ID en tu entorno.',
    'wallet.title': 'Iniciar Sesión',
    'wallet.subtitle': 'Ingresa tu número de teléfono para acceder a tu billetera.',
    'wallet.phonePlaceholder': '+573001234567',
    'wallet.phoneFromWhatsapp': 'Número de teléfono de tu enlace de WhatsApp',
    'wallet.sendCode': 'Enviar Código de Verificación',
    'wallet.sending': 'Enviando...',
    'wallet.codeSentTo': 'Te enviamos un código de 6 dígitos a',
    'wallet.codePlaceholder': '123456',
    'wallet.verify': 'Verificar',
    'wallet.verifying': 'Verificando...',
    'wallet.back': 'Atrás',
    'wallet.whatsappWallet': 'Billetera WhatsApp',
    'wallet.webWallet': 'Billetera Web',
    'wallet.walletAddress': 'Dirección de Billetera',
    'wallet.copy': 'Copiar',
    'wallet.send': 'Enviar',
    'wallet.sendFrom': 'Enviar Desde',
    'wallet.toLabel': 'Para',
    'wallet.toLabelHint': 'Número de teléfono o dirección 0x',
    'wallet.amountLabel': 'Monto (USDC)',
    'wallet.amountPlaceholder': '0.00',
    'wallet.max': 'Máx',
    'wallet.review': 'Revisar',
    'wallet.sending_': 'Enviando...',
    'wallet.to': 'Para',
    'wallet.confirmSend': 'Confirmar Envío',
    'wallet.sendingProgress': 'Enviando...',
    'wallet.sent': '¡Enviado!',
    'wallet.sentSuccess': 'Transacción enviada con éxito.',
    'wallet.viewOnBlockscout': 'Ver en Blockscout',
    'wallet.sendAnother': 'Enviar Otro',
    'wallet.txFailed': 'Transacción Fallida',
    'wallet.retry': 'Intentar de Nuevo',
    'wallet.cancel': 'Cancelar',
    'wallet.settings': 'Configuración',
    'wallet.signOut': 'Cerrar Sesión',
    'wallet.poweredBy': 'Sippy — powered by Arbitrum',
    'wallet.errSendCode': 'No se pudo enviar el código de verificación',
    'wallet.errVerify': 'Verificación fallida',
    'wallet.errInvalidAmount': 'Ingresa un monto válido.',
    'wallet.errInsufficientBalance': 'Saldo insuficiente.',
    'wallet.errNotSippyUser': 'Este número de teléfono no es un usuario de Sippy.',
    'wallet.errTooManyLookups': 'Demasiadas búsquedas. Intenta más tarde.',
    'wallet.errResolvePhone': 'No se pudo resolver el número de teléfono.',
    'wallet.errInvalidInput': 'Ingresa un número de teléfono o dirección 0x válida.',
    'wallet.errNetwork': 'Error de red. Intenta de nuevo.',
    'wallet.errSessionExpired': 'Sesión expirada. Inicia sesión de nuevo.',
    'wallet.errNoWallet':
      'No se encontró billetera. Configura tu billetera primero en sippy.lat/setup',
    'wallet.errSendFailed': 'Envío fallido',
    'wallet.errTransactionFailed': 'Transacción fallida.',

    // settings page
    'settings.loading': 'Verificando tu sesión...',
    'settings.configRequired': 'Configuración requerida:',
    'settings.configInstruction': 'Establece NEXT_PUBLIC_CDP_PROJECT_ID en tu entorno.',
    'settings.authTitle': 'Seguridad de Billetera',
    'settings.authSubtitle': 'Ingresa tu número de teléfono para gestionar tu billetera.',
    'settings.phonePlaceholder': '+573001234567',
    'settings.phoneFromWhatsapp': 'Número de teléfono de tu enlace de WhatsApp',
    'settings.sendCode': 'Enviar Código de Verificación',
    'settings.sending': 'Enviando...',
    'settings.codeSentTo': 'Te enviamos un código de 6 dígitos a',
    'settings.codePlaceholder': '123456',
    'settings.verify': 'Verificar',
    'settings.verifying': 'Verificando...',
    'settings.back': 'Atrás',
    'settings.title': 'Seguridad de Billetera',
    'settings.dailyLimit': 'Límite Diario',
    'settings.noLimitInfo': 'Sin información de límite disponible.',
    'settings.limitLoadError': 'No se pudo cargar la información del límite.',
    'settings.emailVerified': 'Correo verificado',
    'settings.verifyEmailCta': 'Verifica tu correo para desbloquear límites más altos',
    'settings.unlockLimit': 'Desbloquear límites más altos',
    'settings.currentLimit': 'Límite actual',
    'settings.noPermission': 'Sin permiso',
    'settings.changeLimitLabel': 'Cambiar límite',
    'settings.recommended': '(Recomendado)',
    'settings.customPrefix': 'Personalizado: $',
    'settings.perDay': '/día',
    'settings.maxLimit': 'Máx',
    'settings.usedToday': 'Usado hoy',
    'settings.remaining': 'disponible',
    'settings.updateLimit': 'Actualizar Límite',
    'settings.updating': 'Actualizando...',
    'settings.updateSuccess': '¡Límite actualizado!',
    'settings.upgradeLimitCta': 'Tu correo esta verificado! Aumenta tu limite a',
    'settings.upgradeNow': 'Aumentar ahora',
    'settings.disableTitle': 'Deshabilitar Sippy',
    'settings.disableDesc': 'Esto revocará el permiso de Sippy para enviar en tu nombre.',
    'settings.revokePermission': 'Revocar Permiso',
    'settings.revoking': 'Revocando...',
    'settings.emailWarning':
      'Advertencia: Tienes un correo verificado. Revocar el permiso requiere re-verificación.',
    'settings.cancel': 'Cancelar',
    'settings.continueAnyway': 'Continuar de Todas Formas',
    'settings.verifyIdentity': 'Verificar Identidad',
    'settings.emailSendCode': 'Enviar Código',
    'settings.emailSending': 'Enviando...',
    'settings.emailCodeInstruction': 'Ingresa el código enviado a tu correo',
    'settings.emailCodePlaceholder': '123456',
    'settings.emailVerifying': 'Verificando...',
    'settings.enableTitle': 'Habilitar Sippy',
    'settings.enableSippy': 'Habilitar Sippy',
    'settings.enabling': 'Habilitando...',
    'settings.walletAddress': 'Dirección de Billetera',
    'settings.recoveryEmail': 'Correo de Recuperación',
    'settings.emailLoadError': 'No se pudo cargar el estado del correo.',
    'settings.emailLoadRetry': 'Reintentar',
    'settings.addEmailBanner':
      'Agrega un correo de recuperación para desbloquear límites más altos',
    'settings.emailLabel': 'Correo Electrónico',
    'settings.emailPlaceholder': 'tu@ejemplo.com',
    'settings.addEmailBtn': 'Agregar Correo',
    'settings.emailCodeSentTo': 'Código enviado a',
    'settings.emailCodeInput': 'Ingresa el código de 6 dígitos',
    'settings.emailVerifyBtn': 'Verificar',
    'settings.resendCode': 'Reenviar código',
    'settings.emailNotVerified': 'Correo no verificado',
    'settings.emailEnterToVerify': 'Ingresa tu correo para verificarlo',
    'settings.walletSecurity': 'Seguridad de Billetera',
    'settings.exportKey': 'Respaldar Clave Privada',
    'settings.exportWarningTitle': 'Advertencia',
    'settings.exportWarningBody':
      'Este es un respaldo de tu clave de firma. Nunca la compartas. Sippy sigue funcionando normalmente despues de exportar.',
    'settings.understandContinue': 'Entiendo, continuar',
    'settings.loadingKey': 'Cargando...',
    'settings.transferFirst': 'Transfiere fondos primero',
    'settings.transferDesc':
      'Mueve tu USDC a la direccion de exportacion. Despues de transferir, estos fondos solo seran accesibles con la clave exportada, no a traves de Sippy.',
    'settings.smartBalance': 'Balance de billetera',
    'settings.transferTo': 'Transferir a direccion de exportacion',
    'settings.transferBtn': 'Transferir',
    'settings.skipShowKey': 'Omitir y mostrar clave de todas formas',
    'settings.skipWarning':
      'Si omites, tus fondos permanecen en tu billetera Sippy y siguen siendo accesibles desde la app.',
    'settings.transferring': 'Transfiriendo...',
    'settings.movingFunds': 'Moviendo fondos...',
    'settings.retryTransfer': 'Reintentar transferencia',
    'settings.skipAnyway': 'Omitir de todas formas',
    'settings.yourPrivateKey': 'Tu Clave Privada',
    'settings.copyKey': 'Copiar Clave',
    'settings.copied': '¡Copiado!',
    'settings.done': 'Listo',
    'settings.keyWillClear': 'La clave se borrará de la memoria cuando salgas de esta página.',
    'settings.noExportAccount': 'No hay cuenta disponible para exportar.',
    'settings.openWallet': 'Abrir Billetera',
    'settings.signOut': 'Cerrar Sesión',
    'settings.poweredBy': 'Sippy — powered by Arbitrum',
    'settings.errGateRequired': 'Se requiere verificación de correo para continuar.',
    'settings.errInvalidCode': 'Código inválido o expirado.',
    'settings.errNoVerifiedEmail': 'No hay correo verificado en el archivo.',
    'settings.errSweepFailed': 'Transferencia fallida. Intenta de nuevo.',
    'settings.errExportFailed': 'Exportación fallida. Intenta de nuevo.',
    'settings.errSendOtp': 'No se pudo enviar el código de verificación',
    'settings.errVerifyOtp': 'Verificación fallida',
    'settings.errRevokeFailed': 'No se pudo revocar el permiso.',
    'settings.errEnableFailed': 'No se pudo habilitar el permiso.',
    'settings.errSendEmailCode': 'No se pudo enviar el código de correo',
    'settings.errVerifyEmailCode': 'No se pudo verificar el código de correo',
    'settings.errGeneric': 'Algo salió mal. Intenta de nuevo.',
    'settings.languageTitle': 'Idioma',
    'settings.langEn': 'Inglés',
    'settings.langEs': 'Español',
    'settings.langPt': 'Portugués',
    'settings.langAuto': 'Detección automática',
    'settings.langSaveError': 'Error al guardar el idioma',

    // activity component
    'activity.noActivity': 'Sin actividad reciente',
    'activity.willAppear': 'Las transacciones aparecerán aquí',
    'activity.recentActivity': 'Actividad Reciente',
    'activity.last10': 'Últimas 10 transacciones',
    'activity.pending': 'Pendiente',
    'activity.failed': 'Fallida',
    'activity.to': 'Para: ',
    'activity.from': 'De: ',
    'activity.address': 'Dirección: ',
    'activity.sent': 'enviado',
    'activity.received': 'recibido',
    'activity.transaction': 'transacción',
    'activity.viewReceipt': 'Haz clic para ver el recibo',

    // time formatting
    'time.justNow': 'Ahora mismo',
    'time.mAgo': 'hace {n}m',
    'time.hAgo': 'hace {n}h',
    'time.dAgo': 'hace {n}d',
    // landing page
    'landing.skip': 'Ir al contenido',
    'landing.nav.tryIt': 'Probar',
    'landing.nav.openWhatsapp': 'Abrir WhatsApp',
    'landing.status.online': 'EN L\u00cdNEA',
    'landing.hero.line1': 'manda plata',
    'landing.hero.line2': 'por texto.',
    'landing.hero.sub1': 'd\u00f3lares digitales por WhatsApp.',
    'landing.hero.sub2': 'sin descargar apps. interfaz simple por mensaje.',
    'landing.hero.openWhatsapp': 'Abrir WhatsApp',
    'landing.hero.fundPhone': 'Fondea un Tel\u00e9fono',
    'landing.tags.1': 'ARBITRUM ONE',
    'landing.tags.2': 'USDC NATIVO',
    'landing.tags.3': 'LATAM PRIMERO',
    'landing.tags.4': '2026',
    'landing.marquee.1': 'Los bancos tardan d\u00edas',
    'landing.marquee.2': 'Las transferencias cuestan demasiado',
    'landing.marquee.3': 'Las apps piden descarga',
    'landing.marquee.4': 'Las contrase\u00f1as se olvidan',
    'landing.process.label': 'El Proceso',
    'landing.process.title': 'C\u00f3mo Funciona',
    'landing.step1.num': '01',
    'landing.step1.title': 'Escr\u00edbele a Sippy',
    'landing.step1.desc': 'Abre WhatsApp y saluda. Sin descargar apps, sin ir al banco.',
    'landing.step2.num': '02',
    'landing.step2.title': 'Conecta o recibe USDC',
    'landing.step2.desc': 'Usa tu wallet o recibe fondos directamente en tu n\u00famero.',
    'landing.step3.num': '03',
    'landing.step3.title': 'Env\u00eda a cualquiera',
    'landing.step3.desc':
      'Manda un monto y un n\u00famero de tel\u00e9fono. Reciben d\u00f3lares digitales al instante.',
    'landing.step1.desc.desktop': 'Abre WhatsApp y saluda.\nSin descargar apps, sin ir al banco.',
    'landing.step2.desc.desktop': 'Usa tu wallet o recibe fondos\ndirectamente en tu n\u00famero.',
    'landing.step3.desc.desktop':
      'Manda un monto y un n\u00famero de tel\u00e9fono.\nReciben d\u00f3lares digitales al instante.',
    'landing.step3.note':
      'Billeteras non-custodial vinculadas a n\u00fameros de tel\u00e9fono.\nLiquidaci\u00f3n en segundos en Arbitrum. Sin app.',
    'landing.hood.title': 'Por Dentro',
    'landing.hood.desc':
      'Construido sobre infraestructura blockchain robusta para seguridad y velocidad.',
    'landing.spec1.title': 'USDC Nativo',
    'landing.spec1.desc':
      'Las transacciones liquidan en USDC, una stablecoin ampliamente utilizada en blockchain. Transparente, auditada y l\u00edquida.',
    'landing.spec1.tag1': 'AUTO // LIQUIDAR',
    'landing.spec1.tag2': 'ESTABLE // USDC',
    'landing.spec2.title': 'Velocidad Arbitrum L2',
    'landing.spec2.desc':
      'Finalidad de transacci\u00f3n en segundos y comisiones bajas en Arbitrum.',
    'landing.spec3.title': 'Non-Custodial',
    'landing.spec3.desc': 'Sippy no custodia fondos. T\u00fa controlas tu wallet y tus llaves.',
    'landing.spec4.title': 'Lenguaje Natural',
    'landing.spec4.desc':
      'Escribe lo que necesitas con tus propias palabras. Sippy entiende c\u00f3mo hablas.',
    'landing.everyone.title': 'Hecho para Todos',
    'landing.everyone.label': 'CASOS DE USO',
    'landing.everyone.desc': 'Un mensaje para mover plata. Sin banco, sin app, sin fronteras.',
    'landing.pill.1': 'Pagos entre Personas',
    'landing.pill.2': 'Pago Freelance',
    'landing.pill.3': 'Dividir Cuentas',
    'landing.pill.4': 'Micro-transacciones',
    'landing.pill.5': 'Pagos Globales',
    'landing.pill.6': 'Ahorrar en D\u00f3lares',
    'landing.crt.footer': 'manda WhatsApp a este n\u00famero. eso es todo.',
    'landing.cta.label': 'EMPIEZA',
    'landing.cta.title': 'Empieza Ya',
    'landing.cta.desc': 'Abre WhatsApp, saluda y empieza a mover plata en segundos.',
    'landing.cta.button': 'Empezar en WhatsApp',
    'landing.cta.trust': 'non-custodial \u00b7 t\u00fa controlas tus fondos',
    'landing.footer.desc':
      'Interfaz para enviar y recibir USDC por WhatsApp\npara Latinoam\u00e9rica',
    'landing.footer.features': '/funciones',
    'landing.footer.fund': '/fondear',
    'landing.footer.about': '/nosotros',
    'landing.footer.support': '/soporte',
    'landing.footer.docs': '/docs',
    'landing.footer.contact': '/contacto',
    'landing.readout.1.label': 'Red',
    'landing.readout.1.value': 'Arbitrum One',
    'landing.readout.2.label': 'Liquidaci\u00f3n',
    'landing.readout.2.value': 'USDC',
    'landing.readout.3.label': 'Custodia',
    'landing.readout.3.value': 'Non-custodial',
    'landing.readout.4.label': 'Interfaz',
    'landing.readout.4.value': 'WhatsApp',
    'landing.footer.copyright': '\u00a9 2026 Sippy',
    'landing.footer.terms': 'T\u00e9rminos',
    'landing.footer.privacy': 'Privacidad',
    'landing.footer.version': 'v0.1.0 // LATAM // 2026',
    'landing.footer.disclaimer': 'Sippy no est\u00e1 afiliado con WhatsApp ni con Meta Platforms.',
    'landing.footer.legal':
      'Sippy es una interfaz para interactuar con wallets en blockchain. No custodia fondos ni ofrece servicios financieros regulados. El uso de stablecoins implica riesgos.',

    // about page
    'about.badge.live': 'En vivo en Arbitrum One',
    'about.badge.launch': 'Lanzamiento Q2 2026',
    'about.hero.title.line1': 'La billetera de d\u00f3lares',
    'about.hero.title.line2': 'para Latinoam\u00e9rica',
    'about.hero.desc':
      'Sippy convierte WhatsApp en una billetera USDC en Arbitrum One para que puedas enviar, recibir y guardar d\u00f3lares por mensajes, sin descargar una app, sin seed phrases y sin saber nada de crypto.',
    'about.how.title.before': 'C\u00f3mo',
    'about.how.title.accent': 'funciona',
    'about.step1.title': 'Crea tu billetera',
    'about.step1.desc': 'Verificaci\u00f3n por SMS. 30 segundos. Tienes tu propia smart wallet.',
    'about.step2.title': 'Fondea tu billetera',
    'about.step2.desc': 'Compra USDC con moneda local. Los fondos llegan directo a tu billetera.',
    'about.step3.title': 'Env\u00eda plata',
    'about.step3.desc':
      'Escribe \u201cenviar $20 a +573001234567\u201d en WhatsApp. Llega en segundos.',
    'about.thesis.title.before': 'Por qu\u00e9',
    'about.thesis.title.accent': 'importa',
    'about.thesis':
      'WhatsApp tiene m\u00e1s del 90% de penetraci\u00f3n en Latinoam\u00e9rica. Cientos de millones de personas lo abren antes del desayuno, y la mayor\u00eda quiere estabilidad en d\u00f3lares porque las monedas locales no paran de perder valor. Pero nadie se va a descargar una app nueva para eso. Sippy pone una billetera de d\u00f3lares dentro de la app que ya usan, con un agente de IA que habla su idioma.',
    'about.arch.title': 'Arquitectura',
    'about.arch.subtitle': 'Mensaje de WhatsApp entra, transacci\u00f3n on-chain sale',
    'about.arch1.title': 'WhatsApp Business API',
    'about.arch1.desc': 'Interfaz de usuario v\u00eda Meta Cloud API',
    'about.arch2.title': 'Coinbase CDP Wallets',
    'about.arch2.desc': 'Smart accounts embebidas non-custodial',
    'about.arch3.title': 'Agente IA',
    'about.arch3.desc': 'Pagos con IA en espa\u00f1ol, ingl\u00e9s y portugu\u00e9s',
    'about.arch4.title': 'USDC en Arbitrum One',
    'about.arch4.desc': 'Estable, regulado, liquidez profunda',
    'about.arch5.title': 'Arbitrum One',
    'about.arch5.desc': 'Liquidaci\u00f3n de bajo costo, ~$0.01 por transacci\u00f3n',
    'about.arch6.title': 'GasRefuel.sol',
    'about.arch6.desc': 'Transacciones sin gas para los usuarios',
    'about.trust.title.before': 'Confianza y',
    'about.trust.title.accent': 'Seguridad',
    'about.trust.desc':
      'Los usuarios son due\u00f1os de sus billeteras. Sippy opera mediante permisos de gasto que los usuarios configuran y pueden revocar en cualquier momento.',
    'about.pillar1.title': 'Non-custodial',
    'about.pillar1.desc':
      'Coinbase CDP Embedded Wallets. Los usuarios controlan sus propias smart accounts y pueden exportar sus llaves privadas.',
    'about.pillar2.title': 'L\u00edmites controlados por el usuario',
    'about.pillar2.desc':
      'L\u00edmites diarios de gasto aplicados on-chain v\u00eda SpendPermissionManager. Los usuarios los configuran y revocan cuando quieran.',
    'about.pillar3.title': 'Totalmente transparente',
    'about.pillar3.desc':
      'Cada transacci\u00f3n es verificable en Arbiscan. Monto, destinatario, timestamp, todo on-chain.',
    'about.traction.title': 'Tracci\u00f3n',
    'about.traction1.title': 'Finalista ETHOnline 2025',
    'about.traction1.desc': 'Seleccionado entre cientos de proyectos en ETHGlobal.',
    'about.traction1.link': 'Ver showcase',
    'about.traction2.title': 'Programa de Grants de Arbitrum',
    'about.traction2.desc':
      'Financiado por Arbitrum New Protocols and Ideas 3.0 v\u00eda Questbook.',
    'about.traction3.title': 'En vivo en mainnet',
    'about.traction3.desc':
      'Contratos inteligentes desplegados y operativos en Arbitrum One. Flujo de pago end-to-end validado.',
    'about.cta.title': 'Plata tan r\u00e1pida como tus\u00a0mensajes.',
    'about.cta.sub1': 'Lanzamiento Q2 2026 en Colombia.',
    'about.cta.sub2': 'Hecho para escalar en toda Latinoam\u00e9rica.',
    'about.cta.contact': 'Cont\u00e1ctanos',
    'about.cta.showcase': 'ETHGlobal Showcase',
    'about.footer.home': 'Inicio',
    'about.footer.privacy': 'Pol\u00edtica de Privacidad',
    'about.footer.terms': 'T\u00e9rminos de Servicio',
    'about.footer.contact': 'Contacto',
    'about.footer.built': 'Construido en Arbitrum One',

    // support
    'support.title': '\u00bfNecesitas ayuda?',
    'support.subtitle': 'Env\u00eda una solicitud y te responderemos por email.',
    'support.email': 'Tu email',
    'support.subject': 'Asunto',
    'support.subjectPlaceholder': 'Resumen breve de tu problema',
    'support.category': 'Categor\u00eda',
    'support.category.general': 'General',
    'support.category.payments': 'Pagos',
    'support.category.account': 'Cuenta',
    'support.category.other': 'Otro',
    'support.description': 'Descripci\u00f3n',
    'support.descriptionPlaceholder': 'Cu\u00e9ntanos m\u00e1s sobre tu problema...',
    'support.minChars': 'm\u00edn 20 caracteres',
    'support.submit': 'Enviar',
    'support.submitting': 'Enviando...',
    'support.success.title': '\u00a1Ticket creado!',
    'support.success.message': 'Ticket #{number} \u2014 responderemos a tu email.',
    'support.newTicket': 'Enviar otra solicitud',
    'support.emailVerified': 'verificado',
    'support.verifyEmailFirst':
      'Verifica tu email en Ajustes para enviar tickets de soporte. Tambi\u00e9n puedes contactarnos desde la p\u00e1gina principal.',
    'support.error': 'Algo sali\u00f3 mal. Intenta de nuevo.',
    'support.backHome': 'Volver al inicio',
  },
  pt: {
    // setup page
    'setup.loading': 'Verificando sua conta...',
    'setup.configRequired': 'Configuração necessária:',
    'setup.configInstruction': 'Defina NEXT_PUBLIC_CDP_PROJECT_ID no seu ambiente.',
    'setup.title': 'Configure Sua Carteira',
    'setup.subtitle': 'Digite seu número de telefone para criar sua carteira autocustodiada.',
    'setup.phonePlaceholder': '+5511999999999',
    'setup.phoneFromWhatsapp': 'Número de telefone do seu link do WhatsApp',
    'setup.sendCode': 'Enviar Código de Verificação',
    'setup.sending': 'Enviando...',
    'setup.enterCode': 'Digite o Código',
    'setup.codeSentTo': 'Enviamos um código de 6 dígitos para',
    'setup.codePlaceholder': '123456',
    'setup.verify': 'Verificar',
    'setup.verifying': 'Verificando...',
    'setup.back': 'Voltar',
    'setup.emailTitle': 'Adicionar e-mail de recuperação (recomendado)',
    'setup.emailSubtitle': 'Ajuda a recuperar sua carteira se perder o telefone.',
    'setup.emailPlaceholder': 'voce@exemplo.com',
    'setup.emailSendCode': 'Enviar código',
    'setup.emailSending': 'Enviando...',
    'setup.emailCodeSentTo': 'Código enviado para',
    'setup.emailCodePlaceholder': 'Digite o código de 6 dígitos',
    'setup.emailVerify': 'Verificar',
    'setup.emailVerifying': 'Verificando...',
    'setup.emailVerified': 'E-mail verificado',
    'setup.continuingSetup': 'Continuando configuração...',
    'setup.skipEmail': 'Pular por agora',
    'setup.tosTitle': 'Termos de Serviço',
    'setup.tosSubtitle': 'Revise e aceite nossos Termos de Serviço para continuar.',
    'setup.tosCheckbox': 'Aceito os Termos de Serviço',
    'setup.tosLink': 'Ler Termos de Serviço',
    'setup.tosContinue': 'Continuar',
    'setup.tosRequired': 'Você deve aceitar os Termos de Serviço para continuar.',
    'setup.spendTitle': 'Definir Limite de Gasto',
    'setup.spendSubtitle':
      'Escolha quanto o Sippy pode enviar por dia em seu nome. Você pode alterar isso a qualquer momento.',
    'setup.recommended': '(Recomendado)',
    'setup.customPrefix': 'Personalizado: $',
    'setup.perDay': '/dia',
    'setup.whatThisMeans': 'O que isso significa:',
    'setup.spendExplain': 'Sippy pode enviar até ${n} USDC por dia',
    'setup.limitResets': 'O limite é redefinido automaticamente todos os dias',
    'setup.youOwnWallet': 'Você é dono da sua carteira e chaves',
    'setup.revokable': 'Você pode revogar ou alterar isso a qualquer momento',
    'setup.approve': 'Aprovar e Continuar',
    'setup.approving': 'Aprovando...',
    'setup.preparingWallet': 'Preparando carteira...',
    'setup.fundingGas': 'Configurando gas para sua primeira transação...',
    'setup.allSet': 'Tudo Pronto!',
    'setup.walletReady': 'Sua carteira está pronta. Volte ao WhatsApp e comece a enviar dólares!',
    'setup.yourWallet': 'Sua carteira:',
    'setup.tryCommands': 'Experimente estes comandos:',
    'setup.cmdBalance': 'balance',
    'setup.cmdSend': 'enviar $XX para um amigo',
    'setup.cmdHistory': 'historico',
    'setup.poweredBy': 'Sippy — powered by Arbitrum',
    'setup.errSendCode': 'Falha ao enviar código de verificação',
    'setup.errVerify': 'Verificação falhou',
    'setup.errFundGas':
      'Não foi possível financiar a carteira com gas. Tente novamente mais tarde.',
    'setup.errPrepare': 'Falha ao preparar a carteira. Tente novamente.',
    'setup.errNoWallet': 'Nenhuma carteira encontrada. Tente novamente.',
    'setup.errSpenderNotConfigured': 'Endereço do gastador Sippy não configurado.',
    'setup.errPrepareTx': 'Não foi possível preparar a carteira para a transação. Tente novamente.',
    'setup.errRegisterPermission': 'Falha ao registrar permissão. Tente novamente.',
    'setup.errInsufficientEth':
      'ETH insuficiente para taxas de gas. Aguarde um momento e tente novamente.',
    'setup.errRefuelLimit': 'Você alterou seu limite muitas vezes hoje. Tente novamente amanhã.',
    'setup.errCreatePermission': 'Falha ao criar permissão',
    'setup.errRegisterWallet': 'Falha ao registrar carteira',
    'setup.errSendEmailCode': 'Falha ao enviar código de e-mail',
    'setup.errVerifyEmailCode': 'Falha ao verificar código de e-mail',
    'setup.emailLoginLink': 'Entrar com e-mail',
    'setup.emailLoginTitle': 'Entrar com e-mail',
    'setup.emailLoginSubtitle': 'Digite o e-mail vinculado à sua conta.',
    'setup.emailLoginSendCode': 'Enviar código',
    'setup.emailLoginSending': 'Enviando...',
    'setup.emailLoginCodeSent': 'Se este e-mail estiver registrado, você receberá um código.',
    'setup.emailLoginVerify': 'Verificar',
    'setup.emailLoginVerifying': 'Verificando...',
    'setup.emailLoginBack': 'Voltar para login com telefone',
    'setup.errEmailLogin': 'Código inválido ou expirado',

    // wallet page
    'wallet.loading': 'Verificando sua sessão...',
    'wallet.configRequired': 'Configuração necessária:',
    'wallet.configInstruction': 'Defina NEXT_PUBLIC_CDP_PROJECT_ID no seu ambiente.',
    'wallet.title': 'Entrar',
    'wallet.subtitle': 'Digite seu número de telefone para acessar sua carteira.',
    'wallet.phonePlaceholder': '+5511999999999',
    'wallet.phoneFromWhatsapp': 'Número de telefone do seu link do WhatsApp',
    'wallet.sendCode': 'Enviar Código de Verificação',
    'wallet.sending': 'Enviando...',
    'wallet.codeSentTo': 'Enviamos um código de 6 dígitos para',
    'wallet.codePlaceholder': '123456',
    'wallet.verify': 'Verificar',
    'wallet.verifying': 'Verificando...',
    'wallet.back': 'Voltar',
    'wallet.whatsappWallet': 'Carteira WhatsApp',
    'wallet.webWallet': 'Carteira Web',
    'wallet.walletAddress': 'Endereço da Carteira',
    'wallet.copy': 'Copiar',
    'wallet.send': 'Enviar',
    'wallet.sendFrom': 'Enviar De',
    'wallet.toLabel': 'Para',
    'wallet.toLabelHint': 'Número de telefone ou endereço 0x',
    'wallet.amountLabel': 'Valor (USDC)',
    'wallet.amountPlaceholder': '0.00',
    'wallet.max': 'Máx',
    'wallet.review': 'Revisar',
    'wallet.sending_': 'Enviando...',
    'wallet.to': 'Para',
    'wallet.confirmSend': 'Confirmar Envio',
    'wallet.sendingProgress': 'Enviando...',
    'wallet.sent': 'Enviado!',
    'wallet.sentSuccess': 'Transação enviada com sucesso.',
    'wallet.viewOnBlockscout': 'Ver no Blockscout',
    'wallet.sendAnother': 'Enviar Outro',
    'wallet.txFailed': 'Transação Falhou',
    'wallet.retry': 'Tentar Novamente',
    'wallet.cancel': 'Cancelar',
    'wallet.settings': 'Configurações',
    'wallet.signOut': 'Sair',
    'wallet.poweredBy': 'Sippy — powered by Arbitrum',
    'wallet.errSendCode': 'Falha ao enviar código de verificação',
    'wallet.errVerify': 'Verificação falhou',
    'wallet.errInvalidAmount': 'Digite um valor válido.',
    'wallet.errInsufficientBalance': 'Saldo insuficiente.',
    'wallet.errNotSippyUser': 'Este número de telefone não é um usuário Sippy.',
    'wallet.errTooManyLookups': 'Muitas buscas. Tente novamente mais tarde.',
    'wallet.errResolvePhone': 'Não foi possível resolver o número de telefone.',
    'wallet.errInvalidInput': 'Digite um número de telefone ou endereço 0x válido.',
    'wallet.errNetwork': 'Erro de rede. Tente novamente.',
    'wallet.errSessionExpired': 'Sessão expirada. Entre novamente.',
    'wallet.errNoWallet':
      'Nenhuma carteira encontrada. Configure sua carteira primeiro em sippy.lat/setup',
    'wallet.errSendFailed': 'Envio falhou',
    'wallet.errTransactionFailed': 'Transação falhou.',

    // settings page
    'settings.loading': 'Verificando sua sessão...',
    'settings.configRequired': 'Configuração necessária:',
    'settings.configInstruction': 'Defina NEXT_PUBLIC_CDP_PROJECT_ID no seu ambiente.',
    'settings.authTitle': 'Segurança da Carteira',
    'settings.authSubtitle': 'Digite seu número de telefone para gerenciar sua carteira.',
    'settings.phonePlaceholder': '+5511999999999',
    'settings.phoneFromWhatsapp': 'Número de telefone do seu link do WhatsApp',
    'settings.sendCode': 'Enviar Código de Verificação',
    'settings.sending': 'Enviando...',
    'settings.codeSentTo': 'Enviamos um código de 6 dígitos para',
    'settings.codePlaceholder': '123456',
    'settings.verify': 'Verificar',
    'settings.verifying': 'Verificando...',
    'settings.back': 'Voltar',
    'settings.title': 'Segurança da Carteira',
    'settings.dailyLimit': 'Limite Diário',
    'settings.noLimitInfo': 'Sem informações de limite disponíveis.',
    'settings.limitLoadError': 'Não foi possível carregar as informações do limite.',
    'settings.emailVerified': 'E-mail verificado',
    'settings.verifyEmailCta': 'Verifique seu e-mail para desbloquear limites mais altos',
    'settings.unlockLimit': 'Desbloquear limites mais altos',
    'settings.currentLimit': 'Limite atual',
    'settings.noPermission': 'Sem permissão',
    'settings.changeLimitLabel': 'Alterar limite',
    'settings.recommended': '(Recomendado)',
    'settings.customPrefix': 'Personalizado: $',
    'settings.perDay': '/dia',
    'settings.maxLimit': 'Máx',
    'settings.usedToday': 'Usado hoje',
    'settings.remaining': 'disponível',
    'settings.updateLimit': 'Atualizar Limite',
    'settings.updating': 'Atualizando...',
    'settings.updateSuccess': 'Limite atualizado!',
    'settings.upgradeLimitCta': 'Seu e-mail esta verificado! Aumente seu limite para',
    'settings.upgradeNow': 'Aumentar agora',
    'settings.disableTitle': 'Desabilitar Sippy',
    'settings.disableDesc': 'Isso revogará a permissão do Sippy para enviar em seu nome.',
    'settings.revokePermission': 'Revogar Permissão',
    'settings.revoking': 'Revogando...',
    'settings.emailWarning':
      'Aviso: Você tem um e-mail verificado. Revogar a permissão requer reverificação.',
    'settings.cancel': 'Cancelar',
    'settings.continueAnyway': 'Continuar Mesmo Assim',
    'settings.verifyIdentity': 'Verificar Identidade',
    'settings.emailSendCode': 'Enviar Código',
    'settings.emailSending': 'Enviando...',
    'settings.emailCodeInstruction': 'Digite o código enviado para seu e-mail',
    'settings.emailCodePlaceholder': '123456',
    'settings.emailVerifying': 'Verificando...',
    'settings.enableTitle': 'Habilitar Sippy',
    'settings.enableSippy': 'Habilitar Sippy',
    'settings.enabling': 'Habilitando...',
    'settings.walletAddress': 'Endereço da Carteira',
    'settings.recoveryEmail': 'E-mail de Recuperação',
    'settings.emailLoadError': 'Não foi possível carregar o status do e-mail.',
    'settings.emailLoadRetry': 'Tentar novamente',
    'settings.addEmailBanner':
      'Adicione um e-mail de recuperação para desbloquear limites de gasto mais altos',
    'settings.emailLabel': 'Endereço de E-mail',
    'settings.emailPlaceholder': 'voce@exemplo.com',
    'settings.addEmailBtn': 'Adicionar E-mail',
    'settings.emailCodeSentTo': 'Código enviado para',
    'settings.emailCodeInput': 'Digite o código de 6 dígitos',
    'settings.emailVerifyBtn': 'Verificar',
    'settings.resendCode': 'Reenviar código',
    'settings.emailNotVerified': 'E-mail não verificado',
    'settings.emailEnterToVerify': 'Digite seu e-mail para verificá-lo',
    'settings.walletSecurity': 'Segurança da Carteira',
    'settings.exportKey': 'Fazer Backup da Chave Privada',
    'settings.exportWarningTitle': 'Aviso',
    'settings.exportWarningBody':
      'Este e um backup da sua chave de assinatura. Nunca a compartilhe. O Sippy continua funcionando normalmente apos a exportacao.',
    'settings.understandContinue': 'Entendo, continuar',
    'settings.loadingKey': 'Carregando...',
    'settings.transferFirst': 'Transfira fundos primeiro',
    'settings.transferDesc':
      'Mova seu USDC para o endereco de exportacao. Apos a transferencia, esses fundos so serao acessiveis com a chave exportada, nao pelo Sippy.',
    'settings.smartBalance': 'Saldo da carteira',
    'settings.transferTo': 'Transferir para endereco de exportacao',
    'settings.transferBtn': 'Transferir',
    'settings.skipShowKey': 'Pular e mostrar chave mesmo assim',
    'settings.skipWarning':
      'Se pular, seus fundos permanecem na sua carteira Sippy e continuam acessiveis pelo app.',
    'settings.transferring': 'Transferindo...',
    'settings.movingFunds': 'Movendo fundos...',
    'settings.retryTransfer': 'Tentar transferência novamente',
    'settings.skipAnyway': 'Pular mesmo assim',
    'settings.yourPrivateKey': 'Sua Chave Privada',
    'settings.copyKey': 'Copiar Chave',
    'settings.copied': 'Copiado!',
    'settings.done': 'Concluído',
    'settings.keyWillClear': 'A chave será apagada da memória quando você sair desta página.',
    'settings.noExportAccount': 'Nenhuma conta disponível para exportar.',
    'settings.openWallet': 'Abrir Carteira',
    'settings.signOut': 'Sair',
    'settings.poweredBy': 'Sippy — powered by Arbitrum',
    'settings.errGateRequired': 'Verificação de e-mail necessária para continuar.',
    'settings.errInvalidCode': 'Código inválido ou expirado.',
    'settings.errNoVerifiedEmail': 'Nenhum e-mail verificado encontrado.',
    'settings.errSweepFailed': 'Transferência falhou. Tente novamente.',
    'settings.errExportFailed': 'Exportação falhou. Tente novamente.',
    'settings.errSendOtp': 'Falha ao enviar código de verificação',
    'settings.errVerifyOtp': 'Verificação falhou',
    'settings.errRevokeFailed': 'Falha ao revogar permissão.',
    'settings.errEnableFailed': 'Falha ao habilitar permissão.',
    'settings.errSendEmailCode': 'Falha ao enviar código de e-mail',
    'settings.errVerifyEmailCode': 'Falha ao verificar código de e-mail',
    'settings.errGeneric': 'Algo deu errado. Tente novamente.',
    'settings.languageTitle': 'Idioma',
    'settings.langEn': 'Inglês',
    'settings.langEs': 'Espanhol',
    'settings.langPt': 'Português',
    'settings.langAuto': 'Detecção automática',
    'settings.langSaveError': 'Erro ao salvar idioma',

    // activity component
    'activity.noActivity': 'Nenhuma atividade recente',
    'activity.willAppear': 'As transações aparecerão aqui',
    'activity.recentActivity': 'Atividade Recente',
    'activity.last10': 'Últimas 10 transações',
    'activity.pending': 'Pendente',
    'activity.failed': 'Falhou',
    'activity.to': 'Para: ',
    'activity.from': 'De: ',
    'activity.address': 'Endereço: ',
    'activity.sent': 'enviado',
    'activity.received': 'recebido',
    'activity.transaction': 'transação',
    'activity.viewReceipt': 'Clique para ver o recibo',

    // time formatting
    'time.justNow': 'Agora',
    'time.mAgo': 'há {n}m',
    'time.hAgo': 'há {n}h',
    'time.dAgo': 'há {n}d',
    // landing page
    'landing.skip': 'Pular para o conte\u00fado',
    'landing.nav.tryIt': 'Testar',
    'landing.nav.openWhatsapp': 'Abrir WhatsApp',
    'landing.status.online': 'ONLINE',
    'landing.hero.line1': 'manda grana',
    'landing.hero.line2': 'por mensagem.',
    'landing.hero.sub1': 'd\u00f3lares digitais pelo WhatsApp.',
    'landing.hero.sub2': 'sem downloads. interface simples por mensagem.',
    'landing.hero.openWhatsapp': 'Abrir WhatsApp',
    'landing.hero.fundPhone': 'Financie um Celular',
    'landing.tags.1': 'ARBITRUM ONE',
    'landing.tags.2': 'USDC NATIVO',
    'landing.tags.3': 'LATAM PRIMEIRO',
    'landing.tags.4': '2026',
    'landing.marquee.1': 'Bancos demoram dias',
    'landing.marquee.2': 'Transfer\u00eancias custam demais',
    'landing.marquee.3': 'Apps exigem download',
    'landing.marquee.4': 'Senhas s\u00e3o esquecidas',
    'landing.process.label': 'O Processo',
    'landing.process.title': 'Como Funciona',
    'landing.step1.num': '01',
    'landing.step1.title': 'Mande mensagem pro Sippy',
    'landing.step1.desc': 'Abra o WhatsApp e mande um oi. Sem baixar app, sem ir ao banco.',
    'landing.step2.num': '02',
    'landing.step2.title': 'Conecte ou receba USDC',
    'landing.step2.desc': 'Use sua carteira ou receba fundos diretamente no seu n\u00famero.',
    'landing.step3.num': '03',
    'landing.step3.title': 'Envie pra qualquer pessoa',
    'landing.step3.desc':
      'Mande um valor e um n\u00famero de telefone. A pessoa recebe d\u00f3lares digitais na hora.',
    'landing.step1.desc.desktop':
      'Abra o WhatsApp e mande um oi.\nSem baixar app, sem ir ao banco.',
    'landing.step2.desc.desktop':
      'Use sua carteira ou receba fundos\ndiretamente no seu n\u00famero.',
    'landing.step3.desc.desktop':
      'Mande um valor e um n\u00famero de telefone.\nA pessoa recebe d\u00f3lares digitais na hora.',
    'landing.step3.note':
      'Carteiras non-custodial vinculadas a n\u00fameros de telefone.\nLiquida\u00e7\u00e3o em segundos na Arbitrum. Sem app.',
    'landing.hood.title': 'Por Dentro',
    'landing.hood.desc':
      'Constru\u00eddo sobre infraestrutura blockchain robusta para seguran\u00e7a e velocidade.',
    'landing.spec1.title': 'USDC Nativo',
    'landing.spec1.desc':
      'Transa\u00e7\u00f5es liquidam em USDC, uma stablecoin amplamente utilizada em blockchain. Transparente, auditada e l\u00edquida.',
    'landing.spec1.tag1': 'AUTO // LIQUIDAR',
    'landing.spec1.tag2': 'EST\u00c1VEL // USDC',
    'landing.spec2.title': 'Velocidade Arbitrum L2',
    'landing.spec2.desc':
      'Finalidade de transa\u00e7\u00e3o em segundos e taxas baixas na Arbitrum.',
    'landing.spec3.title': 'Non-Custodial',
    'landing.spec3.desc':
      'Sippy n\u00e3o custodia fundos. Voc\u00ea controla sua carteira e suas chaves.',
    'landing.spec4.title': 'Linguagem Natural',
    'landing.spec4.desc':
      'Escreva o que precisa com suas pr\u00f3prias palavras. Sippy entende como voc\u00ea fala.',
    'landing.everyone.title': 'Feito pra Todo Mundo',
    'landing.everyone.label': 'CASOS DE USO',
    'landing.everyone.desc': 'Uma mensagem pra mover dinheiro. Sem banco, sem app, sem fronteiras.',
    'landing.pill.1': 'Pagamentos entre Pessoas',
    'landing.pill.2': 'Pagamento Freelancer',
    'landing.pill.3': 'Rachar Contas',
    'landing.pill.4': 'Micro-transa\u00e7\u00f5es',
    'landing.pill.5': 'Pagamentos Globais',
    'landing.pill.6': 'Poupar em D\u00f3lares',
    'landing.crt.footer': 'manda WhatsApp pra esse n\u00famero. s\u00f3 isso.',
    'landing.cta.label': 'COMECE',
    'landing.cta.title': 'Comece Agora',
    'landing.cta.desc': 'Abra o WhatsApp, mande um oi e comece a movimentar dinheiro em segundos.',
    'landing.cta.button': 'Comece no WhatsApp',
    'landing.cta.trust': 'non-custodial \u00b7 voc\u00ea controla seus fundos',
    'landing.footer.desc':
      'Interface para enviar e receber USDC pelo WhatsApp\npara a Am\u00e9rica Latina',
    'landing.footer.features': '/recursos',
    'landing.footer.fund': '/financiar',
    'landing.footer.about': '/sobre',
    'landing.footer.support': '/suporte',
    'landing.footer.docs': '/docs',
    'landing.footer.contact': '/contato',
    'landing.readout.1.label': 'Rede',
    'landing.readout.1.value': 'Arbitrum One',
    'landing.readout.2.label': 'Liquida\u00e7\u00e3o',
    'landing.readout.2.value': 'USDC',
    'landing.readout.3.label': 'Cust\u00f3dia',
    'landing.readout.3.value': 'Non-custodial',
    'landing.readout.4.label': 'Interface',
    'landing.readout.4.value': 'WhatsApp',
    'landing.footer.copyright': '\u00a9 2026 Sippy',
    'landing.footer.terms': 'Termos',
    'landing.footer.privacy': 'Privacidade',
    'landing.footer.version': 'v0.1.0 // LATAM // 2026',
    'landing.footer.disclaimer': 'Sippy n\u00e3o \u00e9 afiliado ao WhatsApp ou Meta Platforms.',
    'landing.footer.legal':
      'Sippy \u00e9 uma interface para interagir com carteiras em blockchain. N\u00e3o custodia fundos nem oferece servi\u00e7os financeiros regulados. O uso de stablecoins envolve riscos.',

    // about page
    'about.badge.live': 'Ativo na Arbitrum One',
    'about.badge.launch': 'Lan\u00e7amento Q2 2026',
    'about.hero.title.line1': 'A carteira de d\u00f3lares',
    'about.hero.title.line2': 'para a Am\u00e9rica Latina',
    'about.hero.desc':
      'Sippy transforma o WhatsApp em uma carteira USDC na Arbitrum One pra voc\u00ea enviar, receber e guardar d\u00f3lares por mensagens, sem baixar app, sem seed phrases e sem saber nada de crypto.',
    'about.how.title.before': 'Como',
    'about.how.title.accent': 'funciona',
    'about.step1.title': 'Crie sua carteira',
    'about.step1.desc':
      'Verifica\u00e7\u00e3o por SMS. 30 segundos. Voc\u00ea ganha sua pr\u00f3pria smart wallet.',
    'about.step2.title': 'Carregue sua carteira',
    'about.step2.desc': 'Compre USDC com moeda local. Os fundos caem direto na sua carteira.',
    'about.step3.title': 'Envie grana',
    'about.step3.desc':
      'Digite \u201cenviar $20 para +573001234567\u201d no WhatsApp. Chega em segundos.',
    'about.thesis.title.before': 'Por que isso',
    'about.thesis.title.accent': 'importa',
    'about.thesis':
      'O WhatsApp tem mais de 90% de penetra\u00e7\u00e3o na Am\u00e9rica Latina. Centenas de milh\u00f5es de pessoas abrem ele antes do caf\u00e9 da manh\u00e3, e a maioria quer estabilidade em d\u00f3lar porque as moedas locais n\u00e3o param de perder valor. Mas ningu\u00e9m vai baixar um app novo pra isso. O Sippy coloca uma carteira de d\u00f3lares dentro do app que eles j\u00e1 usam, com um agente de IA que fala a l\u00edngua deles.',
    'about.arch.title': 'Arquitetura',
    'about.arch.subtitle': 'Mensagem no WhatsApp entra, transa\u00e7\u00e3o on-chain sai',
    'about.arch1.title': 'WhatsApp Business API',
    'about.arch1.desc': 'Interface do usu\u00e1rio via Meta Cloud API',
    'about.arch2.title': 'Coinbase CDP Wallets',
    'about.arch2.desc': 'Smart accounts embarcadas non-custodial',
    'about.arch3.title': 'Agente IA',
    'about.arch3.desc': 'Pagamentos com IA em espanhol, ingl\u00eas e portugu\u00eas',
    'about.arch4.title': 'USDC na Arbitrum One',
    'about.arch4.desc': 'Est\u00e1vel, regulado, liquidez profunda',
    'about.arch5.title': 'Arbitrum One',
    'about.arch5.desc': 'Liquida\u00e7\u00e3o de baixo custo, ~$0.01 por transa\u00e7\u00e3o',
    'about.arch6.title': 'GasRefuel.sol',
    'about.arch6.desc': 'Transa\u00e7\u00f5es sem gas para usu\u00e1rios',
    'about.trust.title.before': 'Confian\u00e7a e',
    'about.trust.title.accent': 'Seguran\u00e7a',
    'about.trust.desc':
      'Os usu\u00e1rios s\u00e3o donos das suas carteiras. O Sippy opera por permiss\u00f5es de gasto que os usu\u00e1rios configuram e podem revogar a qualquer momento.',
    'about.pillar1.title': 'Non-custodial',
    'about.pillar1.desc':
      'Coinbase CDP Embedded Wallets. Os usu\u00e1rios controlam suas pr\u00f3prias smart accounts e podem exportar suas chaves privadas.',
    'about.pillar2.title': 'Limites controlados pelo usu\u00e1rio',
    'about.pillar2.desc':
      'Limites di\u00e1rios de gasto aplicados on-chain via SpendPermissionManager. Os usu\u00e1rios configuram e revogam quando quiserem.',
    'about.pillar3.title': 'Totalmente transparente',
    'about.pillar3.desc':
      'Cada transa\u00e7\u00e3o \u00e9 verific\u00e1vel no Arbiscan. Valor, destinat\u00e1rio, timestamp, tudo on-chain.',
    'about.traction.title': 'Tra\u00e7\u00e3o',
    'about.traction1.title': 'Finalista ETHOnline 2025',
    'about.traction1.desc': 'Selecionado entre centenas de projetos no ETHGlobal.',
    'about.traction1.link': 'Ver showcase',
    'about.traction2.title': 'Programa de Grants da Arbitrum',
    'about.traction2.desc': 'Financiado pelo Arbitrum New Protocols and Ideas 3.0 via Questbook.',
    'about.traction3.title': 'Ativo na mainnet',
    'about.traction3.desc':
      'Contratos inteligentes implantados e operacionais na Arbitrum One. Fluxo de pagamento end-to-end validado.',
    'about.cta.title': 'Grana t\u00e3o r\u00e1pida quanto suas\u00a0mensagens.',
    'about.cta.sub1': 'Lan\u00e7amento Q2 2026 na Col\u00f4mbia.',
    'about.cta.sub2': 'Feito pra escalar em toda a Am\u00e9rica Latina.',
    'about.cta.contact': 'Fale conosco',
    'about.cta.showcase': 'ETHGlobal Showcase',
    'about.footer.home': 'In\u00edcio',
    'about.footer.privacy': 'Pol\u00edtica de Privacidade',
    'about.footer.terms': 'Termos de Servi\u00e7o',
    'about.footer.contact': 'Contato',
    'about.footer.built': 'Constru\u00eddo na Arbitrum One',

    // support
    'support.title': 'Precisa de ajuda?',
    'support.subtitle': 'Envie uma solicita\u00e7\u00e3o e responderemos por email.',
    'support.email': 'Seu email',
    'support.subject': 'Assunto',
    'support.subjectPlaceholder': 'Resumo breve do seu problema',
    'support.category': 'Categoria',
    'support.category.general': 'Geral',
    'support.category.payments': 'Pagamentos',
    'support.category.account': 'Conta',
    'support.category.other': 'Outro',
    'support.description': 'Descri\u00e7\u00e3o',
    'support.descriptionPlaceholder': 'Conte-nos mais sobre seu problema...',
    'support.minChars': 'm\u00edn 20 caracteres',
    'support.submit': 'Enviar',
    'support.submitting': 'Enviando...',
    'support.success.title': 'Ticket criado!',
    'support.success.message': 'Ticket #{number} \u2014 responderemos ao seu email.',
    'support.newTicket': 'Enviar outra solicita\u00e7\u00e3o',
    'support.emailVerified': 'verificado',
    'support.verifyEmailFirst':
      'Verifique seu email em Configura\u00e7\u00f5es para enviar tickets de suporte. Voc\u00ea tamb\u00e9m pode nos contatar pela p\u00e1gina principal.',
    'support.error': 'Algo deu errado. Tente novamente.',
    'support.backHome': 'Voltar ao in\u00edcio',
  },
}

// ── Translation helper ─────────────────────────────────────────────────────────

export function t(key: string, lang: Language): string {
  return TRANSLATIONS[lang]?.[key] ?? TRANSLATIONS['en']?.[key] ?? key
}

// ── Storage functions ──────────────────────────────────────────────────────────

export function storeLanguage(lang: Language): void {
  localStorage.setItem(LANG_KEY, lang)
  document.cookie = `sippy_lang=${lang}; path=/; max-age=31536000; SameSite=Lax`
}

export function getStoredLanguage(): Language | null {
  const stored = localStorage.getItem(LANG_KEY)
  if (stored && (VALID_LANGUAGES as string[]).includes(stored)) {
    return stored as Language
  }
  return null
}

export function clearLanguage(): void {
  localStorage.removeItem(LANG_KEY)
  document.cookie = 'sippy_lang=; path=/; max-age=0; SameSite=Lax'
}

// ── Detection + API fetch ──────────────────────────────────────────────────────

export function detectLanguageFromPhone(phone: string): Language {
  return _getLanguageForPhone(phone) as Language
}

export async function fetchUserLanguage(
  token: string,
  backendUrl: string
): Promise<{ language: Language; source: 'preference' | 'phone' }> {
  const response = await fetch(`${backendUrl}/api/user-language`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) {
    throw new Error(`Failed to fetch user language: ${response.status}`)
  }
  return response.json()
}

// ── Orchestration ──────────────────────────────────────────────────────────────

/**
 * Resolve the active language for the current user.
 *
 * Priority (DB preference must win over stale cache):
 * 1. If token is non-null → try API → store + return; on failure fall through
 * 2. Check localStorage → if non-null, return (cache is authoritative when unauthenticated/offline)
 * 3. Browser locale (navigator.language / Accept-Language via cookie)
 * 4. If phone is non-null and non-empty → phone detection → store + return
 * 5. Return 'en' as absolute last resort
 */
export async function resolveLanguage(
  phone: string | null,
  token: string | null,
  backendUrl: string
): Promise<Language> {
  if (token !== null) {
    try {
      const { language } = await fetchUserLanguage(token, backendUrl)
      storeLanguage(language)
      return language
    } catch (err) {
      console.warn('[i18n] resolveLanguage: API fetch failed, falling back to local sources', err)
    }
  }

  const cached = getStoredLanguage()
  if (cached !== null) {
    return cached
  }

  // Browser locale (set by proxy from Accept-Language, or from navigator)
  const browserLang = detectBrowserLanguage()
  if (browserLang !== null) {
    storeLanguage(browserLang)
    return browserLang
  }

  if (phone !== null && phone !== '') {
    const lang = detectLanguageFromPhone(phone)
    storeLanguage(lang)
    return lang
  }

  return 'en'
}

/**
 * Detect language from browser locale (navigator.language).
 * Returns null if no supported language matches.
 */
function detectBrowserLanguage(): Language | null {
  if (typeof navigator === 'undefined') return null
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const tag of langs) {
    const code = tag.toLowerCase()
    if (code.startsWith('es')) return 'es'
    if (code.startsWith('pt')) return 'pt'
    if (code.startsWith('en')) return 'en'
  }
  return null
}

// ── Error localization ─────────────────────────────────────────────────────────

type ErrorContext =
  | 'otp-send'
  | 'otp-verify'
  | 'email-send'
  | 'email-verify'
  | 'register-permission'
  | 'revoke-permission'
  | 'enable-permission'
  | 'send'
  | 'fund-gas'
  | 'register-wallet'
  | 'export-gate-send'
  | 'export-gate-verify'
  | 'sweep'
  | 'export'

export function localizeError(err: unknown, context: ErrorContext, lang: Language): string {
  const code = (err as { error?: string; code?: string })?.error ?? (err as Error)?.message ?? ''

  // Cross-context code-specific overrides
  if (code === 'gate_required') {
    return t('settings.errGateRequired', lang)
  }
  if (
    code === 'invalid_or_expired_code' &&
    (context === 'email-verify' || context === 'export-gate-verify')
  ) {
    return t('settings.errInvalidCode', lang)
  }
  if (code === 'no_verified_email' && context === 'export-gate-send') {
    return t('settings.errNoVerifiedEmail', lang)
  }

  // Context-based fallbacks
  switch (context) {
    case 'otp-send':
      return t('setup.errSendCode', lang)
    case 'otp-verify':
      return t('setup.errVerify', lang)
    case 'fund-gas':
      return t('setup.errFundGas', lang)
    case 'register-wallet':
      return t('setup.errRegisterWallet', lang)
    case 'email-send':
      return t('setup.errSendEmailCode', lang)
    case 'email-verify':
      return t('setup.errVerifyEmailCode', lang)
    case 'register-permission':
      return t('setup.errRegisterPermission', lang)
    case 'revoke-permission':
      return t('settings.errRevokeFailed', lang)
    case 'enable-permission':
      return t('settings.errEnableFailed', lang)
    case 'send': {
      const lc = code.toLowerCase()
      if (lc.includes('daily limit') || lc.includes('insufficient allowance')) {
        const msg = {
          en: 'Amount exceeds your daily limit. Send less, use "Direct" mode (your gas, no limit), or wait for reset.',
          es: 'El monto excede tu limite diario. Envia menos, usa el modo "Directo" (tu gas, sin limite), o espera el reinicio.',
          pt: 'O valor excede seu limite diario. Envie menos, use o modo "Direto" (seu gas, sem limite), ou aguarde o reinicio.',
        }
        return msg[lang] || msg.en
      }
      if (lc.includes('insufficient balance')) {
        return t('wallet.errInsufficientBalance', lang)
      }
      return t('wallet.errSendFailed', lang)
    }
    case 'sweep':
      return t('settings.errSweepFailed', lang)
    case 'export':
      return t('settings.errExportFailed', lang)
    case 'export-gate-send':
      return t('settings.errSendEmailCode', lang)
    case 'export-gate-verify':
      return t('settings.errVerifyEmailCode', lang)
    default:
      return t('settings.errGeneric', lang)
  }
}

// ── Localized formatRelativeTime ───────────────────────────────────────────────

/**
 * Format a timestamp as a human-readable relative time string.
 * Independent implementation (does not call blockscout.ts).
 */
export function formatRelativeTime(timestamp: number, lang: Language): string {
  const now = Date.now()
  const diffSec = Math.floor((now - timestamp * 1000) / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffSec < 60) {
    return t('time.justNow', lang)
  }
  if (diffMin < 60) {
    return t('time.mAgo', lang).replace('{n}', String(diffMin))
  }
  if (diffHour < 24) {
    return t('time.hAgo', lang).replace('{n}', String(diffHour))
  }
  return t('time.dAgo', lang).replace('{n}', String(diffDay))
}

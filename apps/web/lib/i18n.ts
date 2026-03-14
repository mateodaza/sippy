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

import { getLanguageForPhone as _getLanguageForPhone } from '@sippy/shared';

// ── Types & constants ──────────────────────────────────────────────────────────

export type Language = 'en' | 'es' | 'pt';
export const LANG_KEY = 'sippy_lang';
const VALID_LANGUAGES: Language[] = ['en', 'es', 'pt'];

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
    'setup.spendSubtitle': 'Choose how much Sippy can send per day on your behalf. You can change this anytime.',
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
    'setup.cmdSend': 'send $5 to +573001234567',
    'setup.cmdHistory': 'history',
    'setup.poweredBy': 'Powered by Coinbase',
    // error keys — critical: these must match existing test assertions
    'setup.errSendCode': 'Failed to send verification code',
    'setup.errVerify': 'Verification failed',
    'setup.errFundGas': 'Could not fund wallet with gas. Please try again later.',
    'setup.errPrepare': 'Failed to prepare wallet. Please try again.',
    'setup.errNoWallet': 'No wallet found. Please try again.',
    'setup.errSpenderNotConfigured': 'Sippy spender address not configured.',
    'setup.errPrepareTx': 'Could not prepare wallet for transaction. Please try again.',
    'setup.errRegisterPermission': 'Failed to register permission. Please try again.',
    'setup.errInsufficientEth': "Insufficient ETH for gas fees. Please wait a moment and try again - we're sending you some ETH.",
    'setup.errCreatePermission': 'Failed to create permission',
    'setup.errRegisterWallet': 'Failed to register wallet',
    'setup.errSendEmailCode': 'Failed to send email code',
    'setup.errVerifyEmailCode': 'Failed to verify email code',

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
    'wallet.poweredBy': 'Powered by Coinbase',
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
    'settings.updateLimit': 'Update Limit',
    'settings.updating': 'Updating...',
    'settings.updateSuccess': 'Limit updated!',
    'settings.disableTitle': 'Disable Sippy',
    'settings.disableDesc': 'This will revoke Sippy\'s permission to send on your behalf.',
    'settings.revokePermission': 'Revoke Permission',
    'settings.revoking': 'Revoking...',
    'settings.emailWarning': 'Warning: You have a verified email. Revoking permission requires re-verification.',
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
    'settings.exportKey': 'Export Private Key',
    'settings.exportWarningTitle': 'Warning',
    'settings.exportWarningBody': 'Your private key gives full access to your wallet. Never share it. Store it securely.',
    'settings.understandContinue': 'I understand, continue',
    'settings.loadingKey': 'Loading...',
    'settings.transferFirst': 'Transfer funds first',
    'settings.transferDesc': 'Move your USDC to your Web Wallet before exporting.',
    'settings.smartBalance': 'Smart account balance',
    'settings.transferTo': 'Transfer to Web Wallet',
    'settings.transferBtn': 'Transfer',
    'settings.skipShowKey': 'Skip and show key anyway',
    'settings.skipWarning': 'Your EOA still has funds. Transfer them first to avoid loss.',
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
    'settings.poweredBy': 'Powered by Coinbase',
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
    'setup.spendSubtitle': 'Elige cuánto puede enviar Sippy por día en tu nombre. Puedes cambiarlo en cualquier momento.',
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
    'setup.cmdSend': 'send $5 to +573001234567',
    'setup.cmdHistory': 'history',
    'setup.poweredBy': 'Desarrollado por Coinbase',
    'setup.errSendCode': 'No se pudo enviar el código de verificación',
    'setup.errVerify': 'Verificación fallida',
    'setup.errFundGas': 'No se pudo financiar la billetera con gas. Intenta más tarde.',
    'setup.errPrepare': 'No se pudo preparar la billetera. Intenta de nuevo.',
    'setup.errNoWallet': 'No se encontró billetera. Intenta de nuevo.',
    'setup.errSpenderNotConfigured': 'Dirección del gastador Sippy no configurada.',
    'setup.errPrepareTx': 'No se pudo preparar la billetera para la transacción. Intenta de nuevo.',
    'setup.errRegisterPermission': 'No se pudo registrar el permiso. Intenta de nuevo.',
    'setup.errInsufficientEth': 'ETH insuficiente para comisiones de gas. Espera un momento e intenta de nuevo.',
    'setup.errCreatePermission': 'No se pudo crear el permiso',
    'setup.errRegisterWallet': 'No se pudo registrar la billetera',
    'setup.errSendEmailCode': 'No se pudo enviar el código de correo',
    'setup.errVerifyEmailCode': 'No se pudo verificar el código de correo',

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
    'wallet.poweredBy': 'Desarrollado por Coinbase',
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
    'wallet.errNoWallet': 'No se encontró billetera. Configura tu billetera primero en sippy.lat/setup',
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
    'settings.updateLimit': 'Actualizar Límite',
    'settings.updating': 'Actualizando...',
    'settings.updateSuccess': '¡Límite actualizado!',
    'settings.disableTitle': 'Deshabilitar Sippy',
    'settings.disableDesc': 'Esto revocará el permiso de Sippy para enviar en tu nombre.',
    'settings.revokePermission': 'Revocar Permiso',
    'settings.revoking': 'Revocando...',
    'settings.emailWarning': 'Advertencia: Tienes un correo verificado. Revocar el permiso requiere re-verificación.',
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
    'settings.addEmailBanner': 'Agrega un correo de recuperación para desbloquear límites más altos',
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
    'settings.exportKey': 'Exportar Clave Privada',
    'settings.exportWarningTitle': 'Advertencia',
    'settings.exportWarningBody': 'Tu clave privada da acceso total a tu billetera. Nunca la compartas. Guárdala de forma segura.',
    'settings.understandContinue': 'Entiendo, continuar',
    'settings.loadingKey': 'Cargando...',
    'settings.transferFirst': 'Transfiere fondos primero',
    'settings.transferDesc': 'Mueve tu USDC a tu Billetera Web antes de exportar.',
    'settings.smartBalance': 'Balance de cuenta inteligente',
    'settings.transferTo': 'Transferir a Billetera Web',
    'settings.transferBtn': 'Transferir',
    'settings.skipShowKey': 'Omitir y mostrar clave de todas formas',
    'settings.skipWarning': 'Tu EOA todavía tiene fondos. Transfíerelos primero para evitar pérdidas.',
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
    'settings.poweredBy': 'Desarrollado por Coinbase',
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
    'setup.spendSubtitle': 'Escolha quanto o Sippy pode enviar por dia em seu nome. Você pode alterar isso a qualquer momento.',
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
    'setup.cmdSend': 'send $5 to +5511999999999',
    'setup.cmdHistory': 'history',
    'setup.poweredBy': 'Desenvolvido por Coinbase',
    'setup.errSendCode': 'Falha ao enviar código de verificação',
    'setup.errVerify': 'Verificação falhou',
    'setup.errFundGas': 'Não foi possível financiar a carteira com gas. Tente novamente mais tarde.',
    'setup.errPrepare': 'Falha ao preparar a carteira. Tente novamente.',
    'setup.errNoWallet': 'Nenhuma carteira encontrada. Tente novamente.',
    'setup.errSpenderNotConfigured': 'Endereço do gastador Sippy não configurado.',
    'setup.errPrepareTx': 'Não foi possível preparar a carteira para a transação. Tente novamente.',
    'setup.errRegisterPermission': 'Falha ao registrar permissão. Tente novamente.',
    'setup.errInsufficientEth': 'ETH insuficiente para taxas de gas. Aguarde um momento e tente novamente.',
    'setup.errCreatePermission': 'Falha ao criar permissão',
    'setup.errRegisterWallet': 'Falha ao registrar carteira',
    'setup.errSendEmailCode': 'Falha ao enviar código de e-mail',
    'setup.errVerifyEmailCode': 'Falha ao verificar código de e-mail',

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
    'wallet.poweredBy': 'Desenvolvido por Coinbase',
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
    'wallet.errNoWallet': 'Nenhuma carteira encontrada. Configure sua carteira primeiro em sippy.lat/setup',
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
    'settings.updateLimit': 'Atualizar Limite',
    'settings.updating': 'Atualizando...',
    'settings.updateSuccess': 'Limite atualizado!',
    'settings.disableTitle': 'Desabilitar Sippy',
    'settings.disableDesc': 'Isso revogará a permissão do Sippy para enviar em seu nome.',
    'settings.revokePermission': 'Revogar Permissão',
    'settings.revoking': 'Revogando...',
    'settings.emailWarning': 'Aviso: Você tem um e-mail verificado. Revogar a permissão requer reverificação.',
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
    'settings.addEmailBanner': 'Adicione um e-mail de recuperação para desbloquear limites de gasto mais altos',
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
    'settings.exportKey': 'Exportar Chave Privada',
    'settings.exportWarningTitle': 'Aviso',
    'settings.exportWarningBody': 'Sua chave privada dá acesso total à sua carteira. Nunca a compartilhe. Guarde-a com segurança.',
    'settings.understandContinue': 'Entendo, continuar',
    'settings.loadingKey': 'Carregando...',
    'settings.transferFirst': 'Transfira fundos primeiro',
    'settings.transferDesc': 'Mova seu USDC para sua Carteira Web antes de exportar.',
    'settings.smartBalance': 'Saldo da conta inteligente',
    'settings.transferTo': 'Transferir para Carteira Web',
    'settings.transferBtn': 'Transferir',
    'settings.skipShowKey': 'Pular e mostrar chave mesmo assim',
    'settings.skipWarning': 'Sua EOA ainda tem fundos. Transfira-os primeiro para evitar perda.',
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
    'settings.poweredBy': 'Desenvolvido por Coinbase',
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
  },
};

// ── Translation helper ─────────────────────────────────────────────────────────

export function t(key: string, lang: Language): string {
  return TRANSLATIONS[lang]?.[key] ?? TRANSLATIONS['en']?.[key] ?? key;
}

// ── Storage functions ──────────────────────────────────────────────────────────

export function storeLanguage(lang: Language): void {
  localStorage.setItem(LANG_KEY, lang);
}

export function getStoredLanguage(): Language | null {
  const stored = localStorage.getItem(LANG_KEY);
  if (stored && (VALID_LANGUAGES as string[]).includes(stored)) {
    return stored as Language;
  }
  return null;
}

export function clearLanguage(): void {
  localStorage.removeItem(LANG_KEY);
}

// ── Detection + API fetch ──────────────────────────────────────────────────────

export function detectLanguageFromPhone(phone: string): Language {
  return _getLanguageForPhone(phone) as Language;
}

export async function fetchUserLanguage(
  token: string,
  backendUrl: string
): Promise<{ language: Language; source: 'preference' | 'phone' }> {
  const response = await fetch(`${backendUrl}/api/user-language`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch user language: ${response.status}`);
  }
  return response.json();
}

// ── Orchestration ──────────────────────────────────────────────────────────────

/**
 * Resolve the active language for the current user.
 *
 * Priority (DB preference must win over stale cache):
 * 1. If token is non-null → try API → store + return; on failure fall through
 * 2. Check localStorage → if non-null, return (cache is authoritative when unauthenticated/offline)
 * 3. If phone is non-null and non-empty → phone detection → store + return
 * 4. Return 'en' as absolute last resort
 */
export async function resolveLanguage(
  phone: string | null,
  token: string | null,
  backendUrl: string
): Promise<Language> {
  if (token !== null) {
    try {
      const { language } = await fetchUserLanguage(token, backendUrl);
      storeLanguage(language);
      return language;
    } catch {
      // fall through to cache/phone/default
    }
  }

  const cached = getStoredLanguage();
  if (cached !== null) {
    return cached;
  }

  if (phone !== null && phone !== '') {
    const lang = detectLanguageFromPhone(phone);
    storeLanguage(lang);
    return lang;
  }

  return 'en';
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
  | 'export';

export function localizeError(
  err: unknown,
  context: ErrorContext,
  lang: Language
): string {
  const code =
    (err as { error?: string; code?: string })?.error ??
    (err as Error)?.message ??
    '';

  // Cross-context code-specific overrides
  if (code === 'gate_required') {
    return t('settings.errGateRequired', lang);
  }
  if (
    code === 'invalid_or_expired_code' &&
    (context === 'email-verify' || context === 'export-gate-verify')
  ) {
    return t('settings.errInvalidCode', lang);
  }
  if (code === 'no_verified_email' && context === 'export-gate-send') {
    return t('settings.errNoVerifiedEmail', lang);
  }

  // Context-based fallbacks
  switch (context) {
    case 'otp-send':
      return t('setup.errSendCode', lang);
    case 'otp-verify':
      return t('setup.errVerify', lang);
    case 'fund-gas':
      return t('setup.errFundGas', lang);
    case 'register-wallet':
      return t('setup.errRegisterWallet', lang);
    case 'email-send':
      return t('setup.errSendEmailCode', lang);
    case 'email-verify':
      return t('setup.errVerifyEmailCode', lang);
    case 'register-permission':
      return t('setup.errRegisterPermission', lang);
    case 'revoke-permission':
      return t('settings.errRevokeFailed', lang);
    case 'enable-permission':
      return t('settings.errEnableFailed', lang);
    case 'send':
      return t('wallet.errSendFailed', lang);
    case 'sweep':
      return t('settings.errSweepFailed', lang);
    case 'export':
      return t('settings.errExportFailed', lang);
    case 'export-gate-send':
      return t('settings.errSendEmailCode', lang);
    case 'export-gate-verify':
      return t('settings.errVerifyEmailCode', lang);
    default:
      return t('settings.errGeneric', lang);
  }
}

// ── Localized formatRelativeTime ───────────────────────────────────────────────

/**
 * Format a timestamp as a human-readable relative time string.
 * Independent implementation (does not call blockscout.ts).
 */
export function formatRelativeTime(timestamp: number, lang: Language): string {
  const now = Date.now();
  const diffSec = Math.floor((now - timestamp * 1000) / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) {
    return t('time.justNow', lang);
  }
  if (diffMin < 60) {
    return t('time.mAgo', lang).replace('{n}', String(diffMin));
  }
  if (diffHour < 24) {
    return t('time.hAgo', lang).replace('{n}', String(diffHour));
  }
  return t('time.dAgo', lang).replace('{n}', String(diffDay));
}

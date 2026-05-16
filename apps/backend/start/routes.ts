/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| Exact same paths as the Express backend.
| Meta webhook URLs cannot change.
|
*/

import router from '@adonisjs/core/services/router'
import app from '@adonisjs/core/services/app'
import { middleware } from '#start/kernel'

const PublicStatsController = () => import('#controllers/public_stats_controller')
const HealthController = () => import('#controllers/health_controller')
const WebhookController = () => import('#controllers/webhook_controller')
const ResolveController = () => import('#controllers/resolve_controller')
const NotifyController = () => import('#controllers/notify_controller')
const DebugController = () => import('#controllers/debug_controller')
const EmbeddedWalletController = () => import('#controllers/embedded_wallet_controller')
const AuthApiController = () => import('#controllers/auth_api_controller')
const SupportController = () => import('#controllers/support_controller')
const WebhookAlchemyController = () => import('#controllers/webhook_alchemy_controller')
const OnrampController = () => import('#controllers/onramp_controller')
const OfframpController = () => import('#controllers/offramp_controller')
const EventController = () => import('#controllers/event_controller')
const QrScanController = () => import('#controllers/qr_scan_controller')
const MyPayQrController = () => import('#controllers/my_pay_qr_controller')

// ── Health ──────────────────────────────────────────────────────────────────
router.get('/', [HealthController, 'index'])
router.get('/api/health', [HealthController, 'apiHealth'])
router.get('/health', [HealthController, 'health'])

// ── WhatsApp webhook (exact paths registered in Meta) ───────────────────────
router.get('/webhook/whatsapp', [WebhookController, 'verify'])
router.post('/webhook/whatsapp', [WebhookController, 'handle'])

// ── Alchemy webhook (HMAC-verified, no session auth) ────────────────────
router.post('/webhook/alchemy/address-activity', [WebhookAlchemyController, 'handle'])

// ── Public resolution (IP-throttled, privacy-aware) ─────────────────────────
router.get('/resolve-phone', [ResolveController, 'byPhone']).use(middleware.ipThrottle())
router.get('/resolve-address', [ResolveController, 'byAddress']).use(middleware.ipThrottle())

// ── Notifications (require shared secret) ───────────────────────────────────
router.post('/notify-fund', [NotifyController, 'fund'])

// ── Public stats (aggregate-only, no PII) ────────────────────────────────────
router.get('/api/stats', [PublicStatsController, 'index']).use(middleware.ipThrottle())

// ── Public event lookup (IP-throttled, name/active/endsAt only) ──────────────
router.get('/api/events/:slug', [EventController, 'getEventPublic']).use(middleware.ipThrottle())

// ── QR scan (public). Called by apps/web /q/:shortId page. ──────────────────
// Throttle is intentionally controller-internal (per-shortId, not per-IP) so
// that `rate_limited` outcome can be logged into qr_scans. The middleware
// throttle would short-circuit with 429 before the controller runs, and the
// per-IP key would always see the Next.js server IP. See QR_SYSTEM_SPEC.md.
router.post('/api/qr/scan/:shortId', [QrScanController, 'scan'])

// ── Public support (IP-throttled) ────────────────────────────────────────────
router
  .post('/api/support/public-ticket', [SupportController, 'createPublic'])
  .use(middleware.ipThrottle())

// ── Debug (disabled in production) ──────────────────────────────────────────
if (app.inDev || app.inTest) {
  router.get('/debug/wallets', [DebugController, 'wallets'])
  router.get('/debug/parse-stats', [DebugController, 'parseStats'])
}

// ── Auth routes (public) ────────────────────────────────────────────────────
router
  .group(() => {
    router.post('/send-otp', [AuthApiController, 'sendOtp']).use(middleware.ipThrottle())
    router.post('/verify-otp', [AuthApiController, 'verifyOtp']).use(middleware.ipThrottle())
    router.post('/send-email-login', [AuthApiController, 'sendEmailLogin'])
    router.post('/verify-email-login', [AuthApiController, 'verifyEmailLogin'])
    router.get('/.well-known/jwks.json', [AuthApiController, 'jwks'])
  })
  .prefix('/api/auth')

// Public onramp preview — proxies Colurs's public /api/reload/r2p/preview/{id}/ so
// post-payment redirect pages can show status even if the Sippy session expired.
router.get('/api/onramp/preview/:colursPaymentId', [OnrampController, 'preview'])

// Public minimal status by our internal orderId — used by /onramp success page
// when returning from a bank flow whose Sippy session may have expired. Returns
// only the fields the success page needs (status, amount, method, links).
router.get('/api/onramp/public-status/:orderId', [OnrampController, 'publicStatus'])

// ── JWT-authenticated API routes ────────────────────────────────────────────
router
  .group(() => {
    router.post('/register-wallet', [EmbeddedWalletController, 'registerWallet'])
    router.post('/register-permission', [EmbeddedWalletController, 'registerPermission'])
    router.post('/revoke-permission', [EmbeddedWalletController, 'revokePermission'])
    router.post('/ensure-gas', [EmbeddedWalletController, 'ensureGas'])
    router.get('/wallet-status', [EmbeddedWalletController, 'walletStatus'])
    router.post('/log-export-event', [EmbeddedWalletController, 'logExportEvent'])
    router.post('/resolve-phone', [EmbeddedWalletController, 'resolvePhone'])
    router.post('/send', [EmbeddedWalletController, 'sendFromWeb'])
    router.post('/log-web-send', [EmbeddedWalletController, 'logWebSend'])
    router.post('/auth/send-email-code', [AuthApiController, 'sendEmailCode'])
    router.post('/auth/verify-email-code', [AuthApiController, 'verifyEmailCode'])
    router.get('/auth/email-status', [AuthApiController, 'emailStatus'])
    router.post('/auth/send-gate-code', [AuthApiController, 'sendGateCode'])
    router.post('/auth/verify-gate-code', [AuthApiController, 'verifyGateCode'])
    router.post('/auth/validate-export-gate', [AuthApiController, 'validateExportGate'])
    router.get('/user-language', [AuthApiController, 'userLanguage'])
    router.post('/set-language', [AuthApiController, 'setLanguage'])
    router.post('/set-privacy', [EmbeddedWalletController, 'setPrivacy'])
    router.get('/privacy-status', [EmbeddedWalletController, 'privacyStatus'])
    router.post('/accept-tos', [EmbeddedWalletController, 'acceptTos'])
    router.get('/tos-status', [EmbeddedWalletController, 'tosStatus'])
    router.get('/profile', [EmbeddedWalletController, 'getProfile'])
    router.post('/support/tickets', [SupportController, 'create'])
    router.post('/link-event', [EventController, 'linkEvent'])
    router.post('/event-poap-claimed', [EventController, 'markPoapClaimed'])

    // Personal pay-QR — user-minted, idempotent (one active per user).
    router.get('/qr/my-pay-link', [MyPayQrController, 'show'])
    router.post('/qr/my-pay-link', [MyPayQrController, 'create'])

    // ── Colurs rails — Colombia (+57) only ───────────────────────────────────
    router
      .group(() => {
        // KYC (one-time Colurs user registration + verification)
        router.get('/onramp/kyc', [OnrampController, 'kycStatus'])
        // Default register = quick flow (counterparty only, no /user/, no OTPs).
        router.post('/onramp/kyc/register', [OnrampController, 'kycRegister'])
        // Upgrade-to-full-KYC: triggered when a quick-flow user trips the monthly cap.
        router.post('/onramp/kyc/upgrade-to-full-kyc', [OnrampController, 'kycUpgradeToFullKyc'])
        // Escape hatch from "Under review" — switch a mid-full-KYC user to
        // quick-flow approved so they can start onramping small amounts now.
        router.post('/onramp/kyc/use-quick-flow', [OnrampController, 'kycUseQuickFlow'])
        router
          .post('/onramp/kyc/send-otp', [OnrampController, 'kycSendOtp'])
          .use(middleware.ipThrottle())
        router.post('/onramp/kyc/verify-phone', [OnrampController, 'kycVerifyPhone'])
        router.post('/onramp/kyc/verify-email', [OnrampController, 'kycVerifyEmail'])
        router.post('/onramp/kyc/upload-document', [OnrampController, 'kycUploadDocument'])
        router.post('/onramp/kyc/refresh-level', [OnrampController, 'kycRefreshLevel'])

        // Onramp (COP → USDC via Colurs R2P)
        router.post('/onramp/quote', [OnrampController, 'quote'])
        router.get('/onramp/pse-banks', [OnrampController, 'pseBanks'])
        router.post('/onramp/initiate', [OnrampController, 'initiate'])
        router.get('/onramp/status/:orderId', [OnrampController, 'status'])

        // Offramp (USDC → COP via Colurs FX exchange)
        router.post('/offramp/quote', [OfframpController, 'quote'])
        router.post('/offramp/initiate', [OfframpController, 'initiate'])
        router.get('/offramp/status/:orderId', [OfframpController, 'status'])
        router.get('/offramp/bank-accounts', [OfframpController, 'listBankAccounts'])
        router.post('/offramp/bank-accounts', [OfframpController, 'addBankAccount'])
        router.get('/offramp/banks', [OfframpController, 'availableBanks'])
        router.get('/offramp/document-types', [OfframpController, 'documentTypes'])
      })
      .use(middleware.colombiaOnly())
  })
  .prefix('/api')
  .use(middleware.jwtAuth())

// ── Admin dashboard ─────────────────────────────────────────────────────────
const AdminAuthController = () => import('#controllers/admin/auth_controller')
const DashboardController = () => import('#controllers/admin/dashboard_controller')
const AdminUsersController = () => import('#controllers/admin/users_controller')
const AnalyticsController = () => import('#controllers/admin/analytics_controller')
const RolesController = () => import('#controllers/admin/roles_controller')
const ModerationController = () => import('#controllers/admin/moderation_controller')
const QrSheetsController = () => import('#controllers/admin/qr_sheets_controller')
const AdminEventsController = () => import('#controllers/admin/events_controller')
const OperatorSendController = () => import('#controllers/admin/operator_send_controller')

// Public admin routes
router.get('/admin/login', [AdminAuthController, 'showLogin'])
router.post('/admin/login', [AdminAuthController, 'login'])

// Auth-protected admin routes.
//
// SECURITY: allowlist pattern — every route gets an explicit role gate.
// No route relies on "absence of middleware" being admin-only; that would
// leak to operators on any new route added without thought.
//
// Layers of authorization:
//   1. auth({guards:['web']}) — applied at the group level (login required)
//   2. adminRole({role:'admin'|'operator'}) — applied per-route here
//   3. Controller scope check — for routes operators CAN hit but only for
//      their assigned event (qr-sheets/:slug, events/:slug/attendees)
//
// Spec: OPERATOR_FLOW_PLAN.md — "Authorization layer (3 capas)".
router
  .group(() => {
    // Logout: any authenticated user. No role gate.
    router.post('/logout', [AdminAuthController, 'logout'])

    // ── Admin-only routes ─────────────────────────────────────────────
    router.get('/', [DashboardController, 'index']).use(middleware.adminRole({ role: 'admin' }))
    router
      .get('/users', [AdminUsersController, 'index'])
      .use(middleware.adminRole({ role: 'admin' }))
    router
      .get('/users/:phone', [AdminUsersController, 'show'])
      .use(middleware.adminRole({ role: 'admin' }))
    router
      .get('/analytics', [AnalyticsController, 'index'])
      .use(middleware.adminRole({ role: 'admin' }))
    router
      .get('/parse-patterns', [AnalyticsController, 'parsePatterns'])
      .use(middleware.adminRole({ role: 'admin' }))
    router.get('/roles', [RolesController, 'index']).use(middleware.adminRole({ role: 'admin' }))
    router
      .put('/roles/:id', [RolesController, 'update'])
      .use(middleware.adminRole({ role: 'admin' }))
    router
      .post('/block-user', [ModerationController, 'blockUser'])
      .use(middleware.adminRole({ role: 'admin' }))
    router
      .post('/unblock-user', [ModerationController, 'unblockUser'])
      .use(middleware.adminRole({ role: 'admin' }))
    router
      .post('/backfill-onchain', [WebhookAlchemyController, 'backfill'])
      .use(middleware.adminRole({ role: 'admin' }))
    router
      .post('/restart-poller', [ModerationController, 'restartPoller'])
      .use(middleware.adminRole({ role: 'admin' }))
    router
      .post('/pause', [ModerationController, 'pause'])
      .use(middleware.adminRole({ role: 'admin' }))
    router
      .post('/resume', [ModerationController, 'resume'])
      .use(middleware.adminRole({ role: 'admin' }))
    router
      .post('/qr-sheets/:eventSlug', [QrSheetsController, 'create'])
      .use(middleware.adminRole({ role: 'admin' }))

    // Operator-wallet management (provision, revoke, drain, read). All admin-only.
    router
      .post('/events/:slug/operator', [AdminEventsController, 'assignOperator'])
      .use(middleware.adminRole({ role: 'admin' }))
    router
      .delete('/events/:slug/operator', [AdminEventsController, 'revokeOperator'])
      .use(middleware.adminRole({ role: 'admin' }))
    router
      .get('/events/:slug/operator-wallet', [AdminEventsController, 'getOperatorWallet'])
      .use(middleware.adminRole({ role: 'admin' }))
    router
      .post('/events/:slug/operator-wallet/drain', [AdminEventsController, 'drainOperatorWallet'])
      .use(middleware.adminRole({ role: 'admin' }))

    // ── Operator-or-admin routes ──────────────────────────────────────
    // Operators see ONLY: their own send page, their assigned event's
    // QR sheets, their assigned event's attendees. Scope check inside
    // the controllers enforces the slug match against the operator's
    // assignment.
    router
      .get('/qr-sheets/:eventSlug', [QrSheetsController, 'show'])
      .use(middleware.adminRole({ role: 'operator' }))
    router
      .get('/events/:slug/attendees', [AdminEventsController, 'attendees'])
      .use(middleware.adminRole({ role: 'operator' }))
    router
      .get('/operator/send', [OperatorSendController, 'showSend'])
      .use(middleware.adminRole({ role: 'operator' }))
    router
      .get('/operator/recipient/:phone', [OperatorSendController, 'validateRecipient'])
      .use(middleware.adminRole({ role: 'operator' }))
    router
      .post('/operator/send', [OperatorSendController, 'send'])
      .use(middleware.adminRole({ role: 'operator' }))
  })
  .prefix('/admin')
  .use(middleware.auth({ guards: ['web'] }))

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

const HealthController = () => import('#controllers/health_controller')
const WebhookController = () => import('#controllers/webhook_controller')
const ResolveController = () => import('#controllers/resolve_controller')
const NotifyController = () => import('#controllers/notify_controller')
const DebugController = () => import('#controllers/debug_controller')
const EmbeddedWalletController = () => import('#controllers/embedded_wallet_controller')
const AuthApiController = () => import('#controllers/auth_api_controller')

// ── Health ──────────────────────────────────────────────────────────────────
router.get('/', [HealthController, 'index'])
router.get('/api/health', [HealthController, 'apiHealth'])

// ── WhatsApp webhook (exact paths registered in Meta) ───────────────────────
router.get('/webhook/whatsapp', [WebhookController, 'verify'])
router.post('/webhook/whatsapp', [WebhookController, 'handle'])

// ── Public resolution ───────────────────────────────────────────────────────
router.get('/resolve-phone', [ResolveController, 'byPhone']).use(middleware.ipThrottle())
router.get('/resolve-address', [ResolveController, 'byAddress']).use(middleware.ipThrottle())

// ── Notifications (require shared secret) ───────────────────────────────────
router.post('/notify-fund', [NotifyController, 'fund'])

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
    router.get('/.well-known/jwks.json', [AuthApiController, 'jwks'])
  })
  .prefix('/api/auth')

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
  })
  .prefix('/api')
  .use(middleware.jwtAuth())

// ── Admin dashboard ─────────────────────────────────────────────────────────
const AdminAuthController = () => import('#controllers/admin/auth_controller')
const DashboardController = () => import('#controllers/admin/dashboard_controller')
const AdminUsersController = () => import('#controllers/admin/users_controller')
const AnalyticsController = () => import('#controllers/admin/analytics_controller')
const RolesController = () => import('#controllers/admin/roles_controller')

// Public admin routes
router.get('/admin/login', [AdminAuthController, 'showLogin'])
router.post('/admin/login', [AdminAuthController, 'login'])

// Auth-protected admin routes
router
  .group(() => {
    router.post('/logout', [AdminAuthController, 'logout'])
    router.get('/', [DashboardController, 'index'])
    router.get('/users', [AdminUsersController, 'index'])
    router.get('/users/:phone', [AdminUsersController, 'show'])
    router.get('/analytics', [AnalyticsController, 'index'])
    router.get('/parse-patterns', [AnalyticsController, 'parsePatterns'])
    router.get('/roles', [RolesController, 'index'])
    router.put('/roles/:id', [RolesController, 'update'])
  })
  .prefix('/admin')
  .use(middleware.auth({ guards: ['web'] }))

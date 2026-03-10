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

// ── Auth (OTP + JWKS) ─ NC-006 adds ipThrottle middleware ──────────────────
const AuthApiController = () => import('#controllers/auth_api_controller')
router.post('/api/auth/send-otp', [AuthApiController, 'sendOtp'])
router.post('/api/auth/verify-otp', [AuthApiController, 'verifyOtp'])
router.get('/api/auth/.well-known/jwks.json', [AuthApiController, 'jwks'])

// ── CDP-authenticated API routes ────────────────────────────────────────────
router
  .group(() => {
    router.post('/register-wallet', [EmbeddedWalletController, 'registerWallet'])
    router.post('/register-permission', [EmbeddedWalletController, 'registerPermission'])
    router.post('/revoke-permission', [EmbeddedWalletController, 'revokePermission'])
    router.post('/ensure-gas', [EmbeddedWalletController, 'ensureGas'])
    router.get('/wallet-status', [EmbeddedWalletController, 'walletStatus'])
    router.post('/log-export-event', [EmbeddedWalletController, 'logExportEvent'])
    router.post('/resolve-phone', [EmbeddedWalletController, 'resolvePhone'])
    router.post('/log-web-send', [EmbeddedWalletController, 'logWebSend'])
  })
  .prefix('/api')
  .use(middleware.cdpAuth())

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

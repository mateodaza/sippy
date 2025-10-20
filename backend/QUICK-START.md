# 🚀 WhatsApp Bot - Quick Start

Ya estás verificado como Meta Business. Aquí están los pasos esenciales:

---

## 📝 Resumen de 5 Pasos

### 1️⃣ Configurar Variables de Entorno (5 min)

```bash
cd backend
cp ENV-TEMPLATE.txt .env
# Edita .env con tus credenciales
```

**Necesitas**:

- `WHATSAPP_PHONE_NUMBER_ID` → Meta Developers
- `WHATSAPP_ACCESS_TOKEN` → Meta Developers (Permanent Token)
- `CDP_API_KEY_ID` + `CDP_API_KEY_SECRET` + `CDP_WALLET_SECRET` → Coinbase CDP
- `DATABASE_URL` → Railway PostgreSQL (see step 2.5 below)

### 2️⃣ Setup Railway PostgreSQL (3 min)

1. Go to [Railway](https://railway.app) and create/login to your account
2. Create a new project or open existing one
3. Click **New** → **Database** → **PostgreSQL**
4. Once created, click on the Postgres service → **Variables** tab
5. Copy the `DATABASE_URL` value
6. Add it to your `.env` file

```bash
DATABASE_URL=postgresql://postgres:...@....railway.app:6543/railway
```

### 2.5️⃣ Import Existing Wallets (Optional - 1 min)

If you have existing wallets in `wallets.json`:

```bash
tsx src/commands/import-wallets.ts
```

This will migrate all wallets to PostgreSQL. You can delete `wallets.json` after.

### 3️⃣ Verificar Configuración (1 min)

```bash
npm run verify-config
```

✅ Si todo está bien, continúa. Si hay errores, revisa tu `.env`.

### 4️⃣ Deploy a Railway/Render (10 min)

**Railway (más fácil)**:

```bash
npm i -g @railway/cli
railway login
railway init
railway up
```

Agrega las variables de entorno en Railway dashboard. **Important**: `DATABASE_URL` will be automatically available if your backend service is in the same Railway project as your Postgres database.

**Render**:

1. Ve a [render.com](https://render.com)
2. New Web Service → Conecta tu repo
3. Build: `cd backend && npm install && npm run build`
4. Start: `cd backend && node dist/server.js`
5. Agrega variables de `.env` en "Environment"

### 5️⃣ Configurar Webhook en Meta (3 min)

1. Ve a [Meta Developers](https://developers.facebook.com/) → Tu app → **WhatsApp** → **Configuration**
2. Webhook:
   - **Callback URL**: `https://tu-dominio.com/webhook/whatsapp`
   - **Verify Token**: `sippy_hackathon_2025`
3. Suscríbete a **messages**
4. Click **Verify and Save**

### 6️⃣ Personalizar Perfil (5 min)

1. **WhatsApp** → **Phone Numbers** → Tu número → **Settings**
2. Sube:
   - **Foto de perfil** (640x640px)
   - **Display Name**: "Sippy"
   - **About**: "Envía PYUSD a cualquier número de WhatsApp 💸"
   - **Category**: Financial Services

---

## ✅ Verificar que Funciona

### Test 1: Health Check

```bash
curl https://tu-dominio.com/
```

Respuesta esperada:

```json
{
  "status": "running",
  "message": "Sippy Webhook Server",
  "registeredWallets": 0
}
```

### Test 2: Enviar Mensaje de WhatsApp

Envía desde tu teléfono al número de WhatsApp verificado:

```
start
```

Respuesta esperada:

```
🎉 Welcome to Sippy!

Your wallet has been created:
0xYourWalletAddress...

💡 Commands:
• balance - Check your PYUSD balance
• send X to +57... - Send PYUSD
• help - Show all commands
```

---

## 🎯 Comandos Disponibles

| Comando                   | Acción            |
| ------------------------- | ----------------- |
| `start`                   | Crear wallet      |
| `balance`                 | Ver balance PYUSD |
| `send 5 to +573001234567` | Enviar PYUSD      |
| `help`                    | Mostrar ayuda     |

---

## 🐛 Si Algo No Funciona

### Webhook no recibe mensajes

```bash
# Verifica que tu servidor esté corriendo
curl https://tu-dominio.com/

# Verifica el verify token
curl "https://tu-dominio.com/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=sippy_hackathon_2025&hub.challenge=test"
# Debe responder: test
```

### CDP Wallets no se crean

```bash
# Prueba localmente
npm run dev

# Envía "start" y revisa los logs
```

### Mensajes no se envían

1. Verifica que tu `WHATSAPP_ACCESS_TOKEN` sea permanente
2. Verifica que tenga permisos: `whatsapp_business_messaging`
3. Revisa los logs del servidor

---

## 📖 Documentación Completa

Para configuración avanzada, ver:

- **WHATSAPP-PRODUCTION-SETUP.md** - Guía completa
- **REFUEL_SETUP.md** - Configurar gas automático

---

## 🎉 ¡Listo!

Tu bot ya está en producción. Ahora los usuarios pueden:

1. ✅ Crear wallets enviando "start"
2. ✅ Recibir PYUSD desde tu frontend
3. ✅ Enviar PYUSD a otros números
4. ✅ Consultar su balance

**URL del bot**: `https://wa.me/TU_NUMERO` (sustituye con tu número)

**Frontend integration**: Usa el endpoint `/resolve-phone?phone=+573001234567` para obtener la wallet address de un número.

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

### 2️⃣ Verificar Configuración (1 min)

```bash
npm run verify-config
```

✅ Si todo está bien, continúa. Si hay errores, revisa tu `.env`.

### 3️⃣ Deploy a Railway/Render (10 min)

**Railway (más fácil)**:

```bash
npm i -g @railway/cli
railway login
railway init
railway up
```

Agrega las variables de entorno en Railway dashboard.

**Render**:

1. Ve a [render.com](https://render.com)
2. New Web Service → Conecta tu repo
3. Build: `cd backend && npm install && npm run build`
4. Start: `cd backend && node dist/server.js`
5. Agrega variables de `.env` en "Environment"

### 4️⃣ Configurar Webhook en Meta (3 min)

1. Ve a [Meta Developers](https://developers.facebook.com/) → Tu app → **WhatsApp** → **Configuration**
2. Webhook:
   - **Callback URL**: `https://tu-dominio.com/webhook/whatsapp`
   - **Verify Token**: `sippy_hackathon_2025`
3. Suscríbete a **messages**
4. Click **Verify and Save**

### 5️⃣ Personalizar Perfil (5 min)

1. **WhatsApp** → **Phone Numbers** → Tu número → **Settings**
2. Sube:
   - **Foto de perfil** (640x640px)
   - **Display Name**: "SIPPY"
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
  "message": "SIPPY Webhook Server",
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
🎉 Welcome to SIPPY!

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

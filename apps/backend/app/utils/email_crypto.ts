import * as crypto from 'node:crypto'

function getEncryptionKey(): Buffer {
  const key = process.env.EMAIL_ENCRYPTION_KEY
  if (!key) {
    throw new Error('EMAIL_ENCRYPTION_KEY env var is not set')
  }
  if (!/^[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error('EMAIL_ENCRYPTION_KEY must be 64 hex characters')
  }
  return Buffer.from(key, 'hex')
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function hashEmail(email: string): string {
  const normalized = normalizeEmail(email)
  return crypto.createHash('sha256').update(normalized).digest('hex')
}

export function encryptEmail(email: string): { encrypted: string; iv: string } {
  const keyBuffer = getEncryptionKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv)
  const ciphertext = Buffer.concat([cipher.update(email, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  const combined = Buffer.concat([ciphertext, authTag])
  return {
    encrypted: combined.toString('base64'),
    iv: iv.toString('base64'),
  }
}

export function decryptEmail(encrypted: string, iv: string): string {
  const keyBuffer = getEncryptionKey()
  const combined = Buffer.from(encrypted, 'base64')
  const authTag = combined.subarray(combined.length - 16)
  const ciphertext = combined.subarray(0, combined.length - 16)
  const ivBuffer = Buffer.from(iv, 'base64')
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, ivBuffer)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}

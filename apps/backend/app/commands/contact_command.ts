/**
 * Contact Command Handler — Address Book
 *
 * Handles save, delete, list contact commands and vCard imports.
 * All operations are regex-driven — zero LLM cost.
 * Contact names are never passed to the LLM (prompt injection prevention).
 */

import { type Lang, formatCommandErrorMessage } from '#utils/messages'
import { saveContact, deleteContact, listContacts } from '#services/contact.service'
import type { WhatsAppContact } from '#types/index'
import logger from '@adonisjs/core/services/logger'
import { maskPhone } from '#utils/phone'
import { sanitizeAlias } from '#utils/contact_sanitizer'

// ============================================================================
// Trilingual response strings
// ============================================================================

const RESPONSES: Record<
  Lang,
  {
    save_ok: string
    save_overwrite: string
    save_updated: string
    save_invalid_alias: string
    save_invalid_phone: string
    save_self: string
    save_limit: string
    delete_ok: string
    delete_not_found: string
    list_empty: string
    list_header: string
    vcard_saved: string
    vcard_no_valid: string
    vcard_conflict: string
  }
> = {
  en: {
    save_ok: 'Saved {alias} \u2192 {phone}',
    save_overwrite: '{alias} is saved as {oldPhone}. Update to {newPhone}? Reply YES to confirm.',
    save_updated: 'Updated {alias} \u2192 {phone}',
    save_invalid_alias: 'Invalid contact name. Use letters and numbers only.',
    save_invalid_phone: 'Invalid phone number.',
    save_self: "You can't save yourself as a contact.",
    save_limit: "You've reached the contact limit (50).",
    delete_ok: 'Deleted {alias}',
    delete_not_found: 'Contact "{alias}" not found.',
    list_empty: 'No saved contacts yet.',
    list_header: 'Your contacts:',
    vcard_saved: 'Contact(s) saved:',
    vcard_no_valid: "Couldn't save this contact. Make sure it has a name and phone number.",
    vcard_conflict:
      '\u26a0 {name} already saved with a different number. Use "save {name} {phone}" to update.',
  },
  es: {
    save_ok: 'Guardado {alias} \u2192 {phone}',
    save_overwrite:
      '{alias} est\u00e1 guardado como {oldPhone}. \u00bfActualizar a {newPhone}? Responde S\u00cd.',
    save_updated: 'Actualizado {alias} \u2192 {phone}',
    save_invalid_alias: 'Nombre inv\u00e1lido. Usa solo letras y n\u00fameros.',
    save_invalid_phone: 'N\u00famero inv\u00e1lido.',
    save_self: 'No puedes guardarte a ti mismo.',
    save_limit: 'Alcanzaste el l\u00edmite de contactos (50).',
    delete_ok: 'Borrado {alias}',
    delete_not_found: 'Contacto "{alias}" no encontrado.',
    list_empty: 'Sin contactos guardados.',
    list_header: 'Tus contactos:',
    vcard_saved: 'Contacto(s) guardado(s):',
    vcard_no_valid:
      'No se pudo guardar el contacto. Aseg\u00farate de que tenga nombre y n\u00famero.',
    vcard_conflict:
      '\u26a0 {name} ya est\u00e1 guardado con otro n\u00famero. Usa "guardar {name} {phone}" para actualizar.',
  },
  pt: {
    save_ok: 'Salvo {alias} \u2192 {phone}',
    save_overwrite:
      '{alias} est\u00e1 salvo como {oldPhone}. Atualizar para {newPhone}? Responda SIM.',
    save_updated: 'Atualizado {alias} \u2192 {phone}',
    save_invalid_alias: 'Nome inv\u00e1lido. Use apenas letras e n\u00fameros.',
    save_invalid_phone: 'N\u00famero inv\u00e1lido.',
    save_self: 'Voc\u00ea n\u00e3o pode salvar a si mesmo.',
    save_limit: 'Voc\u00ea atingiu o limite de contatos (50).',
    delete_ok: 'Apagado {alias}',
    delete_not_found: 'Contato "{alias}" n\u00e3o encontrado.',
    list_empty: 'Sem contatos salvos.',
    list_header: 'Seus contatos:',
    vcard_saved: 'Contato(s) salvo(s):',
    vcard_no_valid:
      'N\u00e3o foi poss\u00edvel salvar o contato. Verifique se tem nome e n\u00famero.',
    vcard_conflict:
      '\u26a0 {name} j\u00e1 est\u00e1 salvo com outro n\u00famero. Use "salvar {name} {phone}" para atualizar.',
  },
}

// ============================================================================
// Handlers
// ============================================================================

export interface SaveContactResult {
  message: string
  pendingOverwrite?: { alias: string; newPhone: string }
}

export async function handleSaveContact(
  senderPhone: string,
  alias: string,
  targetPhone: string,
  lang: Lang
): Promise<SaveContactResult> {
  logger.info(`SAVE_CONTACT command from ${maskPhone(senderPhone)}: alias="${alias}"`)

  const result = await saveContact(senderPhone, alias, targetPhone)

  if (result.success) {
    return {
      message: RESPONSES[lang].save_ok
        .replace('{alias}', result.alias)
        .replace('{phone}', result.phone),
    }
  }

  switch (result.error) {
    case 'overwrite_conflict':
      return {
        message: RESPONSES[lang].save_overwrite
          .replace('{alias}', alias)
          .replace('{oldPhone}', result.existingPhone ?? '')
          .replace('{newPhone}', targetPhone),
        pendingOverwrite: { alias, newPhone: targetPhone },
      }
    case 'invalid_alias':
      return { message: RESPONSES[lang].save_invalid_alias }
    case 'invalid_phone':
      return { message: RESPONSES[lang].save_invalid_phone }
    case 'self_contact':
      return { message: RESPONSES[lang].save_self }
    case 'limit_reached':
      return { message: RESPONSES[lang].save_limit }
    default:
      return { message: formatCommandErrorMessage(lang) }
  }
}

export async function handleDeleteContact(
  senderPhone: string,
  alias: string,
  lang: Lang
): Promise<string> {
  logger.info(`DELETE_CONTACT command from ${maskPhone(senderPhone)}: alias="${alias}"`)

  const deleted = await deleteContact(senderPhone, alias)

  if (deleted) {
    return RESPONSES[lang].delete_ok.replace('{alias}', alias)
  }
  return RESPONSES[lang].delete_not_found.replace('{alias}', alias)
}

export async function handleListContacts(senderPhone: string, lang: Lang): Promise<string> {
  logger.info(`LIST_CONTACTS command from ${maskPhone(senderPhone)}`)

  const contacts = await listContacts(senderPhone)

  if (contacts.length === 0) {
    return RESPONSES[lang].list_empty
  }

  const lines = contacts.map((c) => `\u2022 ${c.aliasDisplay} \u2192 ${c.targetPhone}`)
  return `${RESPONSES[lang].list_header}\n${lines.join('\n')}`
}

export async function handleContactCard(
  senderPhone: string,
  contacts: WhatsAppContact[],
  lang: Lang
): Promise<string> {
  logger.info(`CONTACT_CARD from ${maskPhone(senderPhone)}: ${contacts.length} contact(s)`)

  const saved: string[] = []
  const skipped: string[] = []

  for (const contact of contacts.slice(0, 5)) {
    const rawName = contact.name?.formatted_name
    const phone = contact.phones?.[0]?.phone

    if (!rawName || !phone) {
      skipped.push(RESPONSES[lang].vcard_no_valid)
      continue
    }

    const safeName = sanitizeAlias(rawName) ?? rawName.slice(0, 30)

    const result = await saveContact(senderPhone, rawName, phone, 'vcard')
    if (result.success) {
      saved.push(`${result.alias} \u2192 ${result.phone}`)
    } else if (result.error === 'overwrite_conflict') {
      skipped.push(
        RESPONSES[lang].vcard_conflict
          .replace(/\{name\}/g, safeName)
          .replace(/\{phone\}/g, result.existingPhone)
      )
    } else if (result.error === 'limit_reached') {
      skipped.push(RESPONSES[lang].save_limit)
      break // no point continuing if limit is reached
    } else if (result.error === 'self_contact') {
      skipped.push(RESPONSES[lang].save_self)
    } else {
      skipped.push(`${safeName}: ${RESPONSES[lang].save_invalid_phone}`)
    }
  }

  const lines: string[] = []
  if (saved.length > 0) lines.push(RESPONSES[lang].vcard_saved, ...saved)
  if (skipped.length > 0) lines.push('', ...skipped)

  return lines.length > 0 ? lines.join('\n') : RESPONSES[lang].vcard_no_valid
}

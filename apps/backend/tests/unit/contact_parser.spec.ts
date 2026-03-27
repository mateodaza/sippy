/**
 * Address Book — message parser regression tests
 *
 * Groups:
 * A — save_contact parsing (trilingual)
 * B — delete_contact parsing (trilingual)
 * C — list_contacts parsing (trilingual)
 * D — send with alias (recipientRaw instead of recipientError)
 * E — save_contact takes priority over send pattern
 */

import { test } from '@japa/runner'
import { parseMessageWithRegex } from '#utils/message_parser'

// ── Group A: save_contact ───────────────────────────────────────────────────

test.group('A | save_contact parsing', () => {
  test('A-01: EN "save mom +573116613414"', ({ assert }) => {
    const r = parseMessageWithRegex('save mom +573116613414')
    assert.equal(r.command, 'save_contact')
    assert.equal(r.alias, 'mom')
    assert.equal(r.phone, '+573116613414')
  })

  test('A-02: EN "add John 3001234567"', ({ assert }) => {
    const r = parseMessageWithRegex('add John 3001234567')
    assert.equal(r.command, 'save_contact')
    assert.equal(r.alias, 'John')
  })

  test('A-03: ES "guardar mamá +573116613414"', ({ assert }) => {
    const r = parseMessageWithRegex('guardar mamá +573116613414')
    assert.equal(r.command, 'save_contact')
    assert.equal(r.alias, 'mamá')
  })

  test('A-04: ES "agregar papá +573001234567"', ({ assert }) => {
    const r = parseMessageWithRegex('agregar papá +573001234567')
    assert.equal(r.command, 'save_contact')
    assert.equal(r.alias, 'papá')
  })

  test('A-05: PT "salvar mãe +5511999887766"', ({ assert }) => {
    const r = parseMessageWithRegex('salvar mãe +5511999887766')
    assert.equal(r.command, 'save_contact')
    assert.equal(r.alias, 'mãe')
  })

  test('A-06: alias with spaces "save María García +573116613414"', ({ assert }) => {
    const r = parseMessageWithRegex('save María García +573116613414')
    assert.equal(r.command, 'save_contact')
    assert.equal(r.alias, 'María García')
  })

  test('A-07: phone with dashes "save mom +57-311-661-3414"', ({ assert }) => {
    const r = parseMessageWithRegex('save mom +57-311-661-3414')
    assert.equal(r.command, 'save_contact')
  })

  test('A-08: "save" alone does not match', ({ assert }) => {
    const r = parseMessageWithRegex('save')
    assert.notEqual(r.command, 'save_contact')
  })
})

// ── Group B: delete_contact ─────────────────────────────────────────────────

test.group('B | delete_contact parsing', () => {
  test('B-01: EN "delete contact mom"', ({ assert }) => {
    const r = parseMessageWithRegex('delete contact mom')
    assert.equal(r.command, 'delete_contact')
    assert.equal(r.alias, 'mom')
  })

  test('B-02: EN "remove contact John"', ({ assert }) => {
    const r = parseMessageWithRegex('remove contact John')
    assert.equal(r.command, 'delete_contact')
    assert.equal(r.alias, 'John')
  })

  test('B-03: ES "borrar contacto mamá"', ({ assert }) => {
    const r = parseMessageWithRegex('borrar contacto mamá')
    assert.equal(r.command, 'delete_contact')
    assert.equal(r.alias, 'mamá')
  })

  test('B-04: ES "eliminar contacto papá"', ({ assert }) => {
    const r = parseMessageWithRegex('eliminar contacto papá')
    assert.equal(r.command, 'delete_contact')
    assert.equal(r.alias, 'papá')
  })

  test('B-05: PT "apagar contato mãe"', ({ assert }) => {
    const r = parseMessageWithRegex('apagar contato mãe')
    assert.equal(r.command, 'delete_contact')
    assert.equal(r.alias, 'mãe')
  })

  test('B-06: PT "remover contato João"', ({ assert }) => {
    const r = parseMessageWithRegex('remover contato João')
    assert.equal(r.command, 'delete_contact')
    assert.equal(r.alias, 'João')
  })

  test('B-07: alias with spaces "delete contact María García"', ({ assert }) => {
    const r = parseMessageWithRegex('delete contact María García')
    assert.equal(r.command, 'delete_contact')
    assert.equal(r.alias, 'María García')
  })

  test('B-08: "delete mom" without keyword does NOT match (prevents hijacking)', ({ assert }) => {
    const r = parseMessageWithRegex('delete mom')
    assert.notEqual(r.command, 'delete_contact')
  })

  test('B-09: "borrar historial" does NOT match delete_contact', ({ assert }) => {
    const r = parseMessageWithRegex('borrar historial')
    assert.notEqual(r.command, 'delete_contact')
  })

  test('B-10: "eliminar mi cuenta" does NOT match delete_contact', ({ assert }) => {
    const r = parseMessageWithRegex('eliminar mi cuenta')
    assert.notEqual(r.command, 'delete_contact')
  })
})

// ── Group C: list_contacts ──────────────────────────────────────────────────

test.group('C | list_contacts parsing', () => {
  test('C-01: EN "contacts"', ({ assert }) => {
    const r = parseMessageWithRegex('contacts')
    assert.equal(r.command, 'list_contacts')
  })

  test('C-02: EN "my contacts"', ({ assert }) => {
    const r = parseMessageWithRegex('my contacts')
    assert.equal(r.command, 'list_contacts')
  })

  test('C-03: EN "address book"', ({ assert }) => {
    const r = parseMessageWithRegex('address book')
    assert.equal(r.command, 'list_contacts')
  })

  test('C-04: ES "contactos"', ({ assert }) => {
    const r = parseMessageWithRegex('contactos')
    assert.equal(r.command, 'list_contacts')
  })

  test('C-05: ES "mis contactos"', ({ assert }) => {
    const r = parseMessageWithRegex('mis contactos')
    assert.equal(r.command, 'list_contacts')
  })

  test('C-06: PT "contatos"', ({ assert }) => {
    const r = parseMessageWithRegex('contatos')
    assert.equal(r.command, 'list_contacts')
  })

  test('C-07: PT "meus contatos"', ({ assert }) => {
    const r = parseMessageWithRegex('meus contatos')
    assert.equal(r.command, 'list_contacts')
  })

  test('C-08: case insensitive "CONTACTS"', ({ assert }) => {
    const r = parseMessageWithRegex('CONTACTS')
    assert.equal(r.command, 'list_contacts')
  })
})

// ── Group D: send with alias → recipientRaw ─────────────────────────────────

test.group('D | send with non-phone recipient → recipientRaw', () => {
  test('D-01: "send 5 to mom" → recipientRaw="mom", no recipientError', ({ assert }) => {
    const r = parseMessageWithRegex('send 5 to mom')
    assert.equal(r.command, 'send')
    assert.equal(r.amount, 5)
    assert.equal(r.recipientRaw, 'mom')
    assert.isUndefined(r.recipientError)
  })

  test('D-02: "send $10 to María García" → recipientRaw preserved', ({ assert }) => {
    const r = parseMessageWithRegex('send $10 to María García')
    assert.equal(r.command, 'send')
    assert.equal(r.amount, 10)
    assert.isString(r.recipientRaw)
  })

  test('D-03: "enviar 5 a mamá" → recipientRaw="mamá"', ({ assert }) => {
    const r = parseMessageWithRegex('enviar 5 a mamá')
    assert.equal(r.command, 'send')
    assert.equal(r.amount, 5)
    assert.equal(r.recipientRaw, 'mamá')
    assert.isUndefined(r.recipientError)
  })

  test('D-04: valid phone still resolves to recipient, not recipientRaw', ({ assert }) => {
    const r = parseMessageWithRegex('send 5 to +573116613414')
    assert.equal(r.command, 'send')
    assert.equal(r.amount, 5)
    assert.isDefined(r.recipient)
    assert.isUndefined(r.recipientRaw)
  })
})

// ── Group E: save_contact priority over send ────────────────────────────────

test.group('E | save_contact takes priority over send', () => {
  test('E-01: "save mom +573116613414" → save_contact, not send', ({ assert }) => {
    const r = parseMessageWithRegex('save mom +573116613414')
    assert.equal(r.command, 'save_contact')
    assert.notEqual(r.command, 'send')
  })

  test('E-02: "add papá +573001234567" → save_contact, not send', ({ assert }) => {
    const r = parseMessageWithRegex('add papá +573001234567')
    assert.equal(r.command, 'save_contact')
  })
})

// ── Group F: local currency detection ───────────────────────────────────────

test.group('F | local currency detection in send', () => {
  test('F-01: "enviar 10000 pesos a +573001234567" → localCurrency=LOCAL', ({ assert }) => {
    const r = parseMessageWithRegex('enviar 10000 pesos a +573001234567')
    assert.equal(r.command, 'send')
    assert.equal(r.amount, 10000)
    assert.equal(r.localCurrency, 'LOCAL')
    assert.equal(r.localAmount, 10000)
    assert.isDefined(r.recipient)
  })

  test('F-02: "send 50 reais para +5511999887766" → localCurrency=BRL', ({ assert }) => {
    const r = parseMessageWithRegex('send 50 reais para +5511999887766')
    assert.equal(r.command, 'send')
    assert.equal(r.amount, 50)
    assert.equal(r.localCurrency, 'BRL')
  })

  test('F-03: "mandale 5000 pesos a carlos" → localCurrency=LOCAL + recipientRaw', ({ assert }) => {
    const r = parseMessageWithRegex('mandale 5000 pesos a carlos')
    assert.equal(r.command, 'send')
    assert.equal(r.amount, 5000)
    assert.equal(r.localCurrency, 'LOCAL')
    assert.equal(r.recipientRaw, 'carlos')
  })

  test('F-04: "enviar 10 dolares a +573001234567" → no localCurrency (USD)', ({ assert }) => {
    const r = parseMessageWithRegex('enviar 10 dolares a +573001234567')
    assert.equal(r.command, 'send')
    assert.equal(r.amount, 10)
    assert.isUndefined(r.localCurrency)
  })

  test('F-05: "send 5 dollars to +573001234567" → no localCurrency (USD)', ({ assert }) => {
    const r = parseMessageWithRegex('send 5 dollars to +573001234567')
    assert.equal(r.command, 'send')
    assert.equal(r.amount, 5)
    assert.isUndefined(r.localCurrency)
  })

  test('F-06: "send 5 to +573001234567" → no localCurrency (no currency word)', ({ assert }) => {
    const r = parseMessageWithRegex('send 5 to +573001234567')
    assert.equal(r.command, 'send')
    assert.equal(r.amount, 5)
    assert.isUndefined(r.localCurrency)
  })

  test('F-07: "enviar 100 soles a +51999887766" → localCurrency=PEN', ({ assert }) => {
    const r = parseMessageWithRegex('enviar 100 soles a +51999887766')
    assert.equal(r.command, 'send')
    assert.equal(r.localCurrency, 'PEN')
  })

  test('F-08: "Mándale 10000 pesos a Carlos" → accent fix + currency', ({ assert }) => {
    const r = parseMessageWithRegex('Mándale 10000 pesos a Carlos')
    assert.equal(r.command, 'send')
    assert.equal(r.amount, 10000)
    assert.equal(r.localCurrency, 'LOCAL')
    assert.equal(r.recipientRaw, 'carlos')
  })
})

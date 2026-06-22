# Testimonials collection — Tally form + outreach

Covers the Questbook grant **Milestone 2 deliverable #11 — "User testimonials (10–15)"**
(also `M2_CHECKLIST.md` item #7). The form's 0–10 question also feeds the **NPS > 40**
M2 KPI. Tally's free plan has unlimited forms + submissions + Google Sheets, so we use
Tally (no in-app build needed).

Primary language is **Spanish** (most users are ES-speaking); an English form covers
the rest. Tally can't translate one form, so we run one form per language.

---

## ✅ STATUS — built & published (2026-06-22)

Two live Tally forms, one per language:

- 🇪🇸 **Cuéntanos tu historia con Sippy** — https://tally.so/r/lbg4Mp
- 🇬🇧 **Share your Sippy story** — https://tally.so/r/5BrOOb

**Final question order (as built):**

1. First name _(required)_
2. How should we credit you? — First name + country / First name only / Anonymous _(required, consent)_
3. Where are you based? (city, country) _(required)_
4. 0–10: how likely to recommend Sippy? _(required → NPS KPI)_
5. What do you use Sippy for? — multi-select _(optional)_
6. Best thing Sippy has helped you do? _(required, story)_
7. One-line description of Sippy _(optional, pull-quote)_
8. Your WhatsApp _(optional)_

Pending: each form's **Google Sheets** connection needs a one-time Google authorization
(Integrations → Google Sheets → Connect → Log in to Google → approve). Photo question
was dropped per final review.

---

## 1. The Tally form

**Form name (internal):** Sippy Testimonials
**Public title (ES):** Cuéntanos tu historia con Sippy
**Public title (EN):** Share your Sippy story

**Intro / description (ES):**

> Nos encantaría compartir tu experiencia con Sippy. Toma 1 minuto. Tú decides cómo
> aparece tu nombre (o si prefieres quedar anónimo). Gracias por ayudarnos a contar
> esto. 🧡

**Intro (EN):**

> We'd love to share your experience with Sippy. Takes ~1 minute. You choose how your
> name appears — or stay anonymous. Thank you for helping us tell the story. 🧡

### Fields

| #   | Type            | Question (ES / EN)                                                                                                 | Required | Notes                         |
| --- | --------------- | ------------------------------------------------------------------------------------------------------------------ | -------- | ----------------------------- |
| 1   | Short text      | **¿Cómo te llamas?** / What's your first name?                                                                     | ✅       | First name only               |
| 2   | Short text      | **¿De dónde nos escribes? (ciudad, país)** / Where are you based? (city, country)                                  | ✅       | For "— María, Barranquilla"   |
| 3   | Multiple choice | **¿Para qué usas Sippy?** / How do you use Sippy?                                                                  | ⬜       | Options below; allow multiple |
| 4   | Long text       | **En unas frases, ¿qué te ha permitido hacer Sippy?** / In a few sentences, what has Sippy helped you do?          | ✅       | See prompt below              |
| 5   | Short text      | **En una línea, ¿cómo le describirías Sippy a un amigo?** / In one line, how would you describe Sippy to a friend? | ⬜       | Gold for pull-quotes          |
| 6   | Multiple choice | **¿Cómo quieres que te demos crédito?** / How should we credit you?                                                | ✅       | Consent / attribution (below) |
| 7   | Phone           | **Tu WhatsApp (no lo publicamos)** / Your WhatsApp (we won't publish it)                                           | ⬜       | To thank / follow up          |
| 8   | File upload     | **¿Tienes una foto de un evento de Sippy que podamos usar?** / A photo from a Sippy event we can use?              | ⬜       | Optional, free on Tally       |

**Field 3 options (ES / EN):**

- Enviar dinero a familia / Send money to family
- Recibir pagos / Receive payments
- Pagar en negocios o eventos / Pay at shops or events
- Ahorrar en dólares / Save in dollars
- Otro / Other

**Field 4 prompt (helper text, ES):**

> Un momento concreto es perfecto: a quién le enviaste, qué reemplazó (¿efectivo?,
> ¿una transferencia cara?), cómo se sintió.

**Field 4 prompt (EN):**

> A specific moment is perfect: who you sent money to, what it replaced (cash? a
> costly transfer?), and how it felt.

**Field 6 options — attribution / consent (ES / EN):**

- ✅ **Nombre + país** — pueden usar mi nombre y país / **First name + country** — you can use my first name and country
- **Solo nombre** / First name only
- **Anónimo** (ej. "una usuaria en Colombia") / Anonymous (e.g. "a Sippy user in Colombia")

> This question _is_ the consent record. Any of the three is publishable; choosing one
> is opt-in to being quoted. If you want a hard yes/no instead, add a required checkbox
> "Doy permiso para compartir mi testimonio públicamente / I give permission to share my
> testimonial publicly."

### Thank-you screen (ES / EN)

> ¡Gracias! 🧡 Tu historia nos ayuda muchísimo. Si quieres seguir moviendo dólares,
> escríbele a Sippy en WhatsApp. /
> Thank you! 🧡 Your story helps us more than you know. Keep moving dollars — message
> Sippy on WhatsApp.

### Settings

- **Required fields:** 1, 2, 4, 6.
- **Spam:** turn on Tally's reCAPTCHA.
- **Notifications:** email new submissions to `hello@sippy.lat`.
- **Integration:** connect to a **Google Sheet** (or Notion DB) — one row per testimonial; this becomes the source for the website section and the M2 report.
- **Branding:** removing the Tally badge needs Pro ($29/mo) — fine to leave it on for now.
- **URL / share:** rename the link to something like `tally.so/r/sippy-historias`. Use it in the DM below.

### Build it in Tally (~10 min)

1. tally.so → **New form** → start blank.
2. Add the 8 blocks above (type `/` in Tally to pick a block type).
3. Mark 1, 2, 4, 6 required; set field 3 + 6 options.
4. Add the thank-you page text.
5. Integrations → connect Google Sheets; Settings → email notifications to hello@sippy.lat; turn on captcha.
6. Publish, copy the link, drop it into the outreach messages.

> I can also build this for you live in your browser if you're logged into Tally —
> just say the word and grant Chrome access.

---

## 2. Outreach — DM 25 users (item #7, step 1)

Target list: ~25 of the most-active M1 beta users + Pizza Day attendees (the
`pizza-day-poap-drop-final.csv` numbers are a good pool). Personalize `[Nombre]`.

### Initial message (ES)

> Hola [Nombre] 👋 Soy del equipo de Sippy. Estamos juntando algunas historias reales
> de gente que usa Sippy y me encantaría incluir la tuya. ¿Te animas a contarnos en 1
> minuto qué te ha permitido hacer? Es súper rápido y tú decides cómo aparece tu nombre
> (o si prefieres anónimo): [LINK]. ¡Gracias de corazón! 🧡

### Initial message (EN)

> Hi [Name] 👋 I'm from the Sippy team. We're collecting a few real stories from people
> who use Sippy and I'd love to include yours. Mind telling us in ~1 minute what Sippy
> has helped you do? Super quick, and you choose how your name appears (or stay
> anonymous): [LINK]. Thank you! 🧡

### Follow-up after 3 days (ES)

> Hola [Nombre], solo un recordatorio cortito 🙂 Si tienes 1 minuto, nos ayudaría
> muchísimo tu historia con Sippy: [LINK]. Y si prefieres no, ¡todo bien! Gracias igual.

### Follow-up after 3 days (EN)

> Hi [Name], just a quick nudge 🙂 If you have 1 minute, your Sippy story would help us a
> lot: [LINK]. And totally fine if you'd rather not — thanks either way!

**Tips:** send from the Sippy WhatsApp number so it's recognizable; keep it 1:1 (not a
broadcast) so it feels personal; aim for ~25 sends to land 10–15 responses.

---

## 3. Showing them (next step, not blocking today)

Once 10–15 quotes are in the Google Sheet:

- I can build a **testimonials section** on `sippy.lat` (or a `/historias` block) in the
  same equipment/spec-sheet style as the landing page — quote, first name + country,
  optional photo. Data model is simple: `{ quote, name, location, source }`.
- Pull the 3–5 strongest quotes into the M2 report (item #7, step 5 + item #12).
- Only publish quotes whose attribution choice (field 6) allows it.

Say the word when the responses are in and I'll wire up the on-site section.

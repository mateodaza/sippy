/**
 * Blog — lightweight, dependency-free, i18n-aware post registry.
 *
 * Post metadata lives in POSTS (typed). Titles/descriptions are localized.
 * Post bodies live as plain Markdown files in `content/blog/<slug>.<lang>.md`
 * (English `<slug>.en.md` is canonical and the fallback for every language).
 * Rendering is handled by components/blog/Markdown.tsx — no npm dependencies.
 */
import { promises as fs } from 'fs'
import path from 'path'
import type { Language } from './i18n'

/** A string available per-language; `en` is required and used as the fallback. */
export type Localized = { en: string; es?: string; pt?: string }

export type BlogPost = {
  slug: string
  title: Localized
  description: Localized
  /** ISO date, yyyy-mm-dd */
  date: string
  author: string
  tags: string[]
}

/** Pick the best available translation, falling back to English. */
export function pick(value: Localized, lang: Language): string {
  return value[lang] ?? value.en
}

/** Newest first is enforced by getAllPosts(); order here is not significant. */
export const POSTS: BlogPost[] = [
  {
    slug: 'how-sippy-works',
    title: {
      en: 'A dollar wallet inside WhatsApp',
      es: 'Una billetera de dólares dentro de WhatsApp',
      pt: 'Uma carteira de dólares dentro do WhatsApp',
    },
    description: {
      en: 'Sippy starts with a text message: say hi, get a self-custodial USDC wallet, and send dollars in plain language. Here is what happens under the hood and what we learned from the first real users.',
      es: 'Sippy empieza con un mensaje: saluda, recibe una billetera USDC autocustodiada y envía dólares en lenguaje natural. Esto es lo que pasa por debajo y lo que aprendimos de los primeros usuarios reales.',
      pt: 'A Sippy começa com uma mensagem: diga oi, receba uma carteira USDC autocustodiada e envie dólares em linguagem natural. Veja o que acontece por baixo e o que aprendemos com os primeiros usuários reais.',
    },
    date: '2026-06-22',
    author: 'The Sippy Team',
    tags: ['Product', 'How it works', 'WhatsApp'],
  },
  {
    slug: 'training-wheels-for-web3',
    title: {
      en: 'The crypto people use before they learn the words',
      es: 'El cripto que la gente usa antes de aprender las palabras',
      pt: 'O cripto que as pessoas usam antes de aprender as palavras',
    },
    description: {
      en: 'Why Sippy starts as a WhatsApp dollar wallet, why the AI is not allowed to move money, and why the first market is people who need dollars, not people looking for crypto.',
      es: 'Por qué Sippy empieza como una billetera de dólares en WhatsApp, por qué la IA no puede mover dinero, y por qué el primer mercado es la gente que necesita dólares, no la que busca cripto.',
      pt: 'Por que a Sippy começa como uma carteira de dólares no WhatsApp, por que a IA não pode mover dinheiro, e por que o primeiro mercado é quem precisa de dólares, não quem procura cripto.',
    },
    date: '2026-06-21',
    author: 'Mateo Daza',
    tags: ['Vision', 'AI', 'Stablecoins'],
  },
]

const CONTENT_DIR = path.join(process.cwd(), 'content', 'blog')

export function getAllPosts(): BlogPost[] {
  return [...POSTS].sort((a, b) => (a.date < b.date ? 1 : -1))
}

export function getPostMeta(slug: string): BlogPost | undefined {
  return POSTS.find((p) => p.slug === slug)
}

/** Read a localized body, falling back to the English file if needed. */
export async function getPostBody(slug: string, lang: Language = 'en'): Promise<string> {
  const candidates = [
    path.join(CONTENT_DIR, `${slug}.${lang}.md`),
    path.join(CONTENT_DIR, `${slug}.en.md`),
  ]
  for (const file of candidates) {
    try {
      return await fs.readFile(file, 'utf8')
    } catch {
      // try next candidate
    }
  }
  throw new Error(`No body found for blog post "${slug}"`)
}

/** Rough reading-time estimate at ~200 words/minute. */
export function readingTimeMinutes(body: string): number {
  const words = body.trim().split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / 200))
}

export function formatPostDate(date: string, lang: Language = 'en'): string {
  const locale = lang === 'es' ? 'es-ES' : lang === 'pt' ? 'pt-BR' : 'en-US'
  return new Date(`${date}T00:00:00`).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

/**
 * Season 1 — web client types + copy (Phase D / D1).
 *
 * The single, guardable home for every user-facing D1 string on the web (the
 * "your score" page + the public /temporada board). Reputation-only: copy here
 * describes what the user DID and what RAISES their standing — never "reward",
 * "token", "redeem", "airdrop", "earn". A tier is status, not a payout (anything
 * implying a payout is D2 and ships only after Lina clears it). The
 * language-guard test (lib/season.test.ts) scans every string in this file.
 *
 * Tier names are fixed and language-independent (Nuevo · En marcha · Activo ·
 * Fiel · Estrella) — DISPLAY ONLY: the internal slugs (newcomer/activated/active/
 * regular/power) and all thresholds are unchanged. The standing-line and
 * next-action copy are localized. These mirror the backend's messages.ts maps so
 * WhatsApp and web read identically.
 */

import type { Language } from './i18n'
import type { DocsLang } from '@/components/shared/DocsLanguageToggle'

export type Tier = 'newcomer' | 'activated' | 'active' | 'regular' | 'power'

export type ActionCode =
  | 'first_send'
  | 'new_counterparty'
  | 'weekly'
  | 'send_more'
  | 'offramp'
  | 'invite'
  | 'verify'

/** Tier ladder, low → high — drives badge ordering. */
export const TIER_ORDER: readonly Tier[] = [
  'newcomer',
  'activated',
  'active',
  'regular',
  'power',
] as const

/** Fixed, user-facing tier names — identical across languages and to the bot. */
export const SEASON_TIER_NAME: Record<Tier, string> = {
  newcomer: 'Nuevo',
  activated: 'En marcha',
  active: 'Activo',
  regular: 'Fiel',
  power: 'Estrella',
}

// ── API response shapes (from apps/backend season_score_controller) ──────────

export interface NextTier {
  tier: Tier
  scoreToGo: number
  progressPct: number
  weeksToGo: number
  counterpartiesToGo: number
  verificationRequired: boolean
}

export type ScoreResponse =
  | { scored: false; seasonId: string }
  | {
      scored: true
      seasonId: string
      score: number
      tier: Tier
      activeWeeks: number
      distinctCounterparties: number
      nextTier: NextTier | null
      topActions: ActionCode[]
      displayId: string
    }

export interface LeaderboardRow {
  rank: number
  displayId: string
  score: number
  tier: Tier
}

export interface LeaderboardResponse {
  seasonId: string
  leaderboard: LeaderboardRow[]
}

// ── Localized copy ───────────────────────────────────────────────────────────

/** One short, honest standing-line per tier (no perk promises), per language. */
export const TIER_STANDING_LINE: Record<Language, Record<Tier, string>> = {
  en: {
    newcomer: 'just getting started',
    activated: 'took your first step',
    active: 'really using Sippy',
    regular: 'you use Sippy week after week',
    power: 'among the network stars',
  },
  es: {
    newcomer: 'apenas empiezas',
    activated: 'diste tu primer paso',
    active: 'usando Sippy de verdad',
    regular: 'usas Sippy semana tras semana',
    power: 'de las estrellas de la red',
  },
  pt: {
    newcomer: 'começando agora',
    activated: 'deu seu primeiro passo',
    active: 'usando a Sippy de verdade',
    regular: 'usa a Sippy semana após semana',
    power: 'entre as estrelas da rede',
  },
}

/** Next-action copy per code per language — derived guidance, never the formula. */
export const ACTION_LINE: Record<Language, Record<ActionCode, string>> = {
  en: {
    first_send: 'Make your first send to a friend',
    new_counterparty: 'Send to a friend you have not paid yet',
    weekly: 'Use Sippy every week',
    send_more: 'Keep sending to your contacts',
    offramp: 'Cash out to your local currency',
    invite: 'Invite a friend to Sippy',
    verify: 'Verify your identity',
  },
  es: {
    first_send: 'Haz tu primer envío a un amigo',
    new_counterparty: 'Envíale a un amigo al que no le has pagado',
    weekly: 'Usa Sippy cada semana',
    send_more: 'Sigue enviando a tus contactos',
    offramp: 'Saca a tu moneda local',
    invite: 'Invita a un amigo a Sippy',
    verify: 'Verifica tu identidad',
  },
  pt: {
    first_send: 'Faça seu primeiro envio a um amigo',
    new_counterparty: 'Envie para um amigo que ainda não pagou',
    weekly: 'Use a Sippy toda semana',
    send_more: 'Continue enviando aos seus contatos',
    offramp: 'Saque para sua moeda local',
    invite: 'Convide um amigo para a Sippy',
    verify: 'Verifique sua identidade',
  },
}

/** Copy for the authenticated "your score" page (mirrors wallet's trilingual t()). */
export const SCORE_COPY: Record<
  Language,
  {
    title: string
    subtitle: string
    scoreLabel: string
    levelLabel: string
    standingPrefix: string
    progressTitle: string
    progressTo: (tier: string) => string
    topTier: string
    verifyToReach: (tier: string) => string
    firstSendToReach: (tier: string) => string
    pctToward: (pct: number, tier: string) => string
    signalsTitle: string
    activeWeeks: string
    friendsPaid: string
    actionsTitle: string
    boardIdLabel: string
    boardIdHint: string
    viewBoard: string
    emptyTitle: string
    emptyBody: string
    backToWallet: string
  }
> = {
  en: {
    title: 'Your standing',
    subtitle: 'How you are using Sippy',
    scoreLabel: 'Score',
    levelLabel: 'Level',
    standingPrefix: '',
    progressTitle: 'Progress',
    progressTo: (tier) => `Progress to ${tier}`,
    topTier: 'You are at the top level. Keep it up.',
    verifyToReach: (tier) => `Verify your identity to reach ${tier}.`,
    firstSendToReach: (tier) => `Make your first send to reach ${tier}.`,
    pctToward: (pct, tier) => `${pct}% of the way to ${tier}`,
    signalsTitle: 'What it reflects',
    activeWeeks: 'Active weeks',
    friendsPaid: 'Friends you have paid',
    actionsTitle: 'To move up',
    boardIdLabel: 'Your board id',
    boardIdHint: 'Find this id on the season board.',
    viewBoard: 'View the season board',
    emptyTitle: 'No level yet',
    emptyBody: 'Make your first send to a friend to get started.',
    backToWallet: 'Back to wallet',
  },
  es: {
    title: 'Tu nivel',
    subtitle: 'Cómo usas Sippy',
    scoreLabel: 'Puntaje',
    levelLabel: 'Nivel',
    standingPrefix: '',
    progressTitle: 'Progreso',
    progressTo: (tier) => `Progreso hacia ${tier}`,
    topTier: 'Estás en el nivel más alto. Sigue así.',
    verifyToReach: (tier) => `Verifica tu identidad para llegar a ${tier}.`,
    firstSendToReach: (tier) => `Haz tu primer envío para llegar a ${tier}.`,
    pctToward: (pct, tier) => `${pct}% en camino a ${tier}`,
    signalsTitle: 'Qué refleja',
    activeWeeks: 'Semanas activas',
    friendsPaid: 'Amigos a los que pagaste',
    actionsTitle: 'Para subir',
    boardIdLabel: 'Tu id en el tablero',
    boardIdHint: 'Busca este id en el tablero de la temporada.',
    viewBoard: 'Ver el tablero de la temporada',
    emptyTitle: 'Aún sin nivel',
    emptyBody: 'Haz tu primer envío a un amigo para empezar.',
    backToWallet: 'Volver a la billetera',
  },
  pt: {
    title: 'Seu nível',
    subtitle: 'Como você usa a Sippy',
    scoreLabel: 'Pontuação',
    levelLabel: 'Nível',
    standingPrefix: '',
    progressTitle: 'Progresso',
    progressTo: (tier) => `Progresso até ${tier}`,
    topTier: 'Você está no nível mais alto. Continue assim.',
    verifyToReach: (tier) => `Verifique sua identidade para chegar a ${tier}.`,
    firstSendToReach: (tier) => `Faça seu primeiro envio para chegar a ${tier}.`,
    pctToward: (pct, tier) => `${pct}% rumo a ${tier}`,
    signalsTitle: 'O que reflete',
    activeWeeks: 'Semanas ativas',
    friendsPaid: 'Amigos que você pagou',
    actionsTitle: 'Para subir',
    boardIdLabel: 'Seu id no ranking',
    boardIdHint: 'Encontre este id no ranking da temporada.',
    viewBoard: 'Ver o ranking da temporada',
    emptyTitle: 'Ainda sem nível',
    emptyBody: 'Faça seu primeiro envio a um amigo para começar.',
    backToWallet: 'Voltar à carteira',
  },
}

/** Copy for the public /temporada board (mirrors the quest page: ES + EN). */
export const TEMPORADA_COPY: Record<
  DocsLang,
  {
    eyebrow: string
    title: string
    intro: string
    rankHeader: string
    scoreHeader: string
    topPrefix: string
    emptyTitle: string
    emptyBody: string
    aboutTitle: string
    aboutBody: string
    aboutNote: string
    ctaButton: string
    ctaSubtitle: string
    footer: string
    waText: string
    numberLocale: string
  }
> = {
  es: {
    eyebrow: 'Sippy · Temporada',
    title: 'Tablero de la temporada',
    intro:
      'Ranking por uso. Sube quien más usa Sippy de verdad: envíos a amigos, semana tras semana.',
    rankHeader: 'Puesto',
    scoreHeader: 'Puntaje',
    topPrefix: 'Top',
    emptyTitle: 'Aún no hay nadie en el tablero.',
    emptyBody: 'Haz tu primer envío a un amigo y empieza a sumar.',
    aboutTitle: 'Cómo funciona',
    aboutBody:
      'El tablero refleja el uso real de Sippy: enviar a amigos, mantenerte activo y traer gente nueva. Cada nivel describe tu estándar de uso.',
    aboutNote: 'Cada fila es anónima: solo un id estable, sin teléfonos ni nombres.',
    ctaButton: 'Ver mi nivel en Sippy',
    ctaSubtitle: 'Abre WhatsApp y escribe "puntos".',
    footer: 'Sippy · Tu billetera de dólares en WhatsApp',
    waText: 'Hola Sippy! puntos',
    numberLocale: 'es-CO',
  },
  en: {
    eyebrow: 'Sippy · Season',
    title: 'Season board',
    intro:
      'Ranked by usage. The people who really use Sippy climb: sends to friends, week over week.',
    rankHeader: 'Rank',
    scoreHeader: 'Score',
    topPrefix: 'Top',
    emptyTitle: 'No one on the board yet.',
    emptyBody: 'Make your first send to a friend and start climbing.',
    aboutTitle: 'How it works',
    aboutBody:
      'The board reflects real Sippy usage: sending to friends, staying active, and bringing new people on. Each level describes your usage standing.',
    aboutNote: 'Every row is anonymous: just a stable id, no phones, no names.',
    ctaButton: 'See my level in Sippy',
    ctaSubtitle: 'Open WhatsApp and type "score".',
    footer: 'Sippy · Your dollar wallet on WhatsApp',
    waText: 'Hello Sippy! score',
    numberLocale: 'en-US',
  },
}

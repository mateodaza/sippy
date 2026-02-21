/**
 * Zod schemas for LLM output validation
 *
 * Send is excluded from the LLM command enum for M1 — send commands
 * are regex-only to ensure deterministic financial operations.
 */

import { z } from 'zod';

/**
 * Schema for LLM parse results.
 * Note: 'send' is intentionally excluded — send commands are regex-only for M1.
 */
export const llmResultSchema = z.object({
  command: z.enum([
    'balance',
    'start',
    'history',
    'settings',
    'about',
    'help',
    'unknown',
  ]),
  amount: z.number().positive().max(100_000).nullable(),
  recipient: z.string().min(10).nullable(),
  confidence: z.number().min(0).max(1),
  helpfulMessage: z.string().nullable(),
  detectedLanguage: z.enum(['en', 'es', 'pt', 'ambiguous']),
});

export type LLMParseResult = z.infer<typeof llmResultSchema>;

/**
 * Schema for export audit events (wallet recovery feature).
 * Validates event type and UUID attempt ID.
 */
export const exportEventSchema = z.object({
  event: z.enum([
    'initiated',
    'unlocked',
    'iframe_ready',
    'copied',
    'completed',
    'expired',
    'cancelled',
    'swept',
  ]),
  attemptId: z.string().uuid(),
});

export type ExportEvent = z.infer<typeof exportEventSchema>;

/**
 * Schema for web send audit events (wallet fallback feature).
 * Separate from export events — different payload shape.
 */
export const webSendEventSchema = z.object({
  toAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  amount: z.string().regex(/^\d+(\.\d{1,6})?$/),
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
});

export type WebSendEvent = z.infer<typeof webSendEventSchema>;

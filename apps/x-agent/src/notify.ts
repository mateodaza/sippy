import { config } from './lib/config.js';

const TELEGRAM_API = 'https://api.telegram.org/bot';

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Send a content draft to Telegram for review.
 * Uses HTML parse mode (more forgiving than Markdown with special chars).
 */
export async function notifyDraft(draft: {
  id: string;
  content: string;
  archetype: string;
  critiqueScore: number | null | undefined;
  critiqueNote: string | null | undefined;
}): Promise<boolean> {
  const token = config.telegramBotToken();
  const chatId = config.telegramChatId();

  if (!token || !chatId) {
    console.log('[notify] Telegram not configured, skipping notification');
    return false;
  }

  const message = [
    `<b>New draft ready</b>`,
    ``,
    `<pre>${escapeHtml(draft.content)}</pre>`,
    ``,
    `<b>Archetype:</b> ${escapeHtml(draft.archetype)}`,
    `<b>Score:</b> ${draft.critiqueScore ?? '—'}/10`,
    draft.critiqueNote ? `<b>Note:</b> ${escapeHtml(draft.critiqueNote)}` : '',
    ``,
    `<i>Tap the text block above to copy, then paste on X</i>`,
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const res = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[notify] Telegram API error: ${res.status} ${body}`);
      return false;
    }

    console.log(`[notify] Draft ${draft.id} sent to Telegram`);
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[notify] Failed to send Telegram notification: ${msg}`);
    return false;
  }
}

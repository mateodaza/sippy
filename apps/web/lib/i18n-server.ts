/**
 * Server-side locale resolution.
 * Reads the x-sippy-lang header set by proxy.ts, with cookie fallback.
 * Separated from i18n.ts to avoid importing next/headers in client components.
 */
import { headers, cookies } from 'next/headers';
import type { Language } from './i18n';

const VALID_LANGUAGES: readonly string[] = ['en', 'es', 'pt'];

export async function getRequestLang(): Promise<Language> {
  const h = await headers();
  const fromHeader = h.get('x-sippy-lang');
  if (fromHeader && VALID_LANGUAGES.includes(fromHeader)) {
    return fromHeader as Language;
  }
  const c = await cookies();
  const fromCookie = c.get('sippy_lang')?.value;
  if (fromCookie && VALID_LANGUAGES.includes(fromCookie)) {
    return fromCookie as Language;
  }
  return 'en';
}

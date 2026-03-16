import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const VALID_LANGUAGES = ['en', 'es', 'pt'] as const;
type ValidLang = (typeof VALID_LANGUAGES)[number];

function parseAcceptLanguage(request: NextRequest): ValidLang {
  const header = request.headers.get('accept-language') || '';
  const languages = header
    .split(',')
    .map((part) => {
      const [lang, qPart] = part.trim().split(';');
      const raw = qPart ? parseFloat(qPart.split('=')[1] || '0') : 1;
      const q = Number.isNaN(raw) ? 0 : raw;
      return { lang: lang.trim().toLowerCase(), q };
    })
    .sort((a, b) => b.q - a.q);

  for (const { lang } of languages) {
    if (lang.startsWith('es')) return 'es';
    if (lang.startsWith('pt')) return 'pt';
    if (lang.startsWith('en')) return 'en';
  }
  return 'en';
}

export function proxy(request: NextRequest) {
  const existingLang = request.cookies.get('sippy_lang')?.value;
  const isValid = VALID_LANGUAGES.includes(existingLang as ValidLang);
  const lang = isValid ? existingLang! : parseAcceptLanguage(request);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-sippy-lang', lang);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  if (!isValid) {
    response.cookies.set({
      name: 'sippy_lang',
      value: lang,
      path: '/',
      maxAge: 31536000,
      sameSite: 'lax',
    });
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image)(?!.*\\.[\\w]+$).*)',
  ],
};

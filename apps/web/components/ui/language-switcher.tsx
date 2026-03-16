'use client';

import { useRouter } from 'next/navigation';
import { storeLanguage, type Language } from '@/lib/i18n';

const LANGUAGES: { code: Language; label: string }[] = [
  { code: 'en', label: 'EN' },
  { code: 'es', label: 'ES' },
  { code: 'pt', label: 'PT' },
];

export function LanguageSwitcher({ current }: { current: Language }) {
  const router = useRouter();

  const handleChange = (lang: Language) => {
    storeLanguage(lang);
    router.refresh();
  };

  return (
    <div className="flex items-center gap-1 font-mono text-[11px] uppercase tracking-wider">
      {LANGUAGES.map((l, i) => (
        <span key={l.code} className="flex items-center">
          {i > 0 && <span className="text-[var(--text-muted)] mx-1">/</span>}
          <button
            onClick={() => handleChange(l.code)}
            className={`transition-colors duration-200 ${
              current === l.code
                ? 'text-brand-primary'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            {l.label}
          </button>
        </span>
      ))}
    </div>
  );
}

import { getRequestLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { SupportFormLanding } from '@/components/shared/SupportFormLanding'

export default async function SupportPage() {
  const lang = await getRequestLang()

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center p-4 sm:p-8">
      <div className="max-w-lg w-full">
        <div className="text-center mb-8 sm:mb-10">
          <h1 className="font-display font-bold text-3xl sm:text-5xl text-[var(--text-primary)] uppercase mb-3 sm:mb-4">
            {t('support.title', lang)}
          </h1>
          <p className="text-[var(--text-secondary)] text-base sm:text-lg">
            {t('support.subtitle', lang)}
          </p>
        </div>

        <div className="panel-frame rounded-2xl bg-[var(--bg-primary)] p-1">
          <div className="bg-[var(--bg-secondary)] rounded-xl p-6 sm:p-8">
            <SupportFormLanding lang={lang} />
          </div>
        </div>

        <div className="mt-6 text-center">
          <a
            href="/"
            className="text-sm text-[var(--text-secondary)] hover:text-brand-primary transition-colors font-mono tracking-wide uppercase"
          >
            {t('support.backHome', lang)}
          </a>
        </div>
      </div>
    </div>
  )
}

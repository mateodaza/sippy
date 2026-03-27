import Link from 'next/link'

const content: Record<
  string,
  {
    headline: string
    sub: string
    steps: string[]
    trust: { title: string; desc: string }[]
    ctaStart: string
    ctaHow: string
  }
> = {
  en: {
    headline: 'Send and hold digital dollars from WhatsApp.',
    sub: 'No seed phrases. No new app to learn. Start in minutes.',
    steps: [
      'Verify your phone number',
      'Add USDC to your wallet',
      'Send money via WhatsApp or web',
    ],
    trust: [
      { title: 'You own your money', desc: 'Non-custodial. Sippy never holds your funds.' },
      { title: 'It just works', desc: 'Send money like you send a message.' },
      { title: 'Fully transparent', desc: 'Every transaction verifiable on-chain.' },
    ],
    ctaStart: 'Get started',
    ctaHow: 'How Sippy works',
  },
  es: {
    headline: 'Envia y guarda dolares digitales desde WhatsApp.',
    sub: 'Sin frases semilla. Sin apps nuevas. Empieza en minutos.',
    steps: [
      'Verifica tu numero de telefono',
      'Agrega USDC a tu billetera',
      'Envia dinero por WhatsApp o la web',
    ],
    trust: [
      { title: 'Tu dinero es tuyo', desc: 'No-custodial. Sippy nunca guarda tus fondos.' },
      { title: 'Simplemente funciona', desc: 'Envia dinero como envias un mensaje.' },
      { title: 'Totalmente transparente', desc: 'Cada transaccion verificable en la blockchain.' },
    ],
    ctaStart: 'Empezar',
    ctaHow: 'Como funciona Sippy',
  },
  pt: {
    headline: 'Envie e guarde dolares digitais pelo WhatsApp.',
    sub: 'Sem frases semente. Sem app novo. Comece em minutos.',
    steps: [
      'Verifique seu numero de telefone',
      'Adicione USDC a sua carteira',
      'Envie dinheiro pelo WhatsApp ou web',
    ],
    trust: [
      { title: 'Seu dinheiro e seu', desc: 'Nao-custodial. Sippy nunca guarda seus fundos.' },
      { title: 'Simplesmente funciona', desc: 'Envie dinheiro como envia uma mensagem.' },
      { title: 'Totalmente transparente', desc: 'Cada transacao verificavel na blockchain.' },
    ],
    ctaStart: 'Comecar',
    ctaHow: 'Como o Sippy funciona',
  },
}

export default async function HomePage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  const t = content[lang] ?? content.en

  return (
    <main className="flex flex-1 flex-col items-center px-4 py-20">
      {/* Hero */}
      <div className="text-center max-w-2xl mb-16">
        <div className="mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="Sippy" className="h-10 w-auto mx-auto dark:hidden" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-dark.svg" alt="Sippy" className="h-10 w-auto mx-auto hidden dark:block" />
        </div>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4 text-fd-foreground">
          {t.headline}
        </h1>
        <p className="text-fd-muted-foreground text-lg md:text-xl">{t.sub}</p>
      </div>

      {/* Steps */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-3xl w-full mb-16">
        {t.steps.map((step, i) => (
          <div
            key={i}
            className="flex flex-col items-center text-center p-6 rounded-xl border border-fd-border bg-fd-card"
          >
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold mb-3"
              style={{ background: 'hsl(191 100% 42% / 0.1)', color: 'hsl(191 100% 42%)' }}
            >
              {i + 1}
            </div>
            <p className="text-fd-foreground font-medium text-sm">{step}</p>
          </div>
        ))}
      </div>

      {/* Trust */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-3xl w-full mb-16">
        {t.trust.map((item, i) => (
          <div key={i} className="p-5 rounded-xl border border-fd-border bg-fd-card">
            <h3 className="font-semibold text-fd-foreground mb-1 text-sm">{item.title}</h3>
            <p className="text-fd-muted-foreground text-sm">{item.desc}</p>
          </div>
        ))}
      </div>

      {/* CTAs */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Link
          href={`/${lang}/docs/start/get-started`}
          className="rounded-lg px-6 py-3 font-medium text-white transition-colors text-center"
          style={{ background: 'hsl(191 100% 42%)' }}
        >
          {t.ctaStart}
        </Link>
        <Link
          href={`/${lang}/docs/start/how-it-works`}
          className="rounded-lg px-6 py-3 font-medium border border-fd-border text-fd-foreground hover:bg-fd-accent transition-colors text-center"
        >
          {t.ctaHow}
        </Link>
      </div>
    </main>
  )
}

// @ts-nocheck
import { browser } from 'fumadocs-mdx/runtime/browser'
import type * as Config from '../source.config'

const create = browser<
  typeof Config,
  import('fumadocs-mdx/runtime/types').InternalTypeConfig & {
    DocData: {}
  }
>()
const browserCollections = {
  docs: create.doc('docs', {
    'index.es.mdx': () => import('../content/docs/index.es.mdx?collection=docs'),
    'index.mdx': () => import('../content/docs/index.mdx?collection=docs'),
    'index.pt.mdx': () => import('../content/docs/index.pt.mdx?collection=docs'),
    'behind-sippy/principles.mdx': () =>
      import('../content/docs/behind-sippy/principles.mdx?collection=docs'),
    'behind-sippy/why-arbitrum.mdx': () =>
      import('../content/docs/behind-sippy/why-arbitrum.mdx?collection=docs'),
    'behind-sippy/why-digital-dollars.mdx': () =>
      import('../content/docs/behind-sippy/why-digital-dollars.mdx?collection=docs'),
    'behind-sippy/why-whatsapp.mdx': () =>
      import('../content/docs/behind-sippy/why-whatsapp.mdx?collection=docs'),
    'legal/privacy.mdx': () => import('../content/docs/legal/privacy.mdx?collection=docs'),
    'legal/risks.mdx': () => import('../content/docs/legal/risks.mdx?collection=docs'),
    'legal/terms.mdx': () => import('../content/docs/legal/terms.mdx?collection=docs'),
    'start/get-started.mdx': () => import('../content/docs/start/get-started.mdx?collection=docs'),
    'start/how-it-works.mdx': () =>
      import('../content/docs/start/how-it-works.mdx?collection=docs'),
    'start/supported-countries.mdx': () =>
      import('../content/docs/start/supported-countries.mdx?collection=docs'),
    'start/what-is-sippy.mdx': () =>
      import('../content/docs/start/what-is-sippy.mdx?collection=docs'),
    'faq/common-questions.mdx': () =>
      import('../content/docs/faq/common-questions.mdx?collection=docs'),
    'faq/support.mdx': () => import('../content/docs/faq/support.mdx?collection=docs'),
    'faq/troubleshooting.mdx': () =>
      import('../content/docs/faq/troubleshooting.mdx?collection=docs'),
    'trust/fees-limits.mdx': () => import('../content/docs/trust/fees-limits.mdx?collection=docs'),
    'trust/money-safety.mdx': () =>
      import('../content/docs/trust/money-safety.mdx?collection=docs'),
    'trust/recovery.mdx': () => import('../content/docs/trust/recovery.mdx?collection=docs'),
    'trust/security.mdx': () => import('../content/docs/trust/security.mdx?collection=docs'),
    'trust/what-sippy-is-not.mdx': () =>
      import('../content/docs/trust/what-sippy-is-not.mdx?collection=docs'),
    'using-sippy/add-funds.mdx': () =>
      import('../content/docs/using-sippy/add-funds.mdx?collection=docs'),
    'using-sippy/balance-history.mdx': () =>
      import('../content/docs/using-sippy/balance-history.mdx?collection=docs'),
    'using-sippy/invite-someone.mdx': () =>
      import('../content/docs/using-sippy/invite-someone.mdx?collection=docs'),
    'using-sippy/limits.mdx': () =>
      import('../content/docs/using-sippy/limits.mdx?collection=docs'),
    'using-sippy/recovery-email.mdx': () =>
      import('../content/docs/using-sippy/recovery-email.mdx?collection=docs'),
    'using-sippy/send-modes.mdx': () =>
      import('../content/docs/using-sippy/send-modes.mdx?collection=docs'),
    'using-sippy/send-money.mdx': () =>
      import('../content/docs/using-sippy/send-money.mdx?collection=docs'),
    'using-sippy/settings-privacy.mdx': () =>
      import('../content/docs/using-sippy/settings-privacy.mdx?collection=docs'),
    'using-sippy/setup-wallet.mdx': () =>
      import('../content/docs/using-sippy/setup-wallet.mdx?collection=docs'),
  }),
}
export default browserCollections

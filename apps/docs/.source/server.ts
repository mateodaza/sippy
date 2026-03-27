// @ts-nocheck
import * as __fd_glob_37 from '../content/docs/using-sippy/setup-wallet.mdx?collection=docs'
import * as __fd_glob_36 from '../content/docs/using-sippy/settings-privacy.mdx?collection=docs'
import * as __fd_glob_35 from '../content/docs/using-sippy/send-money.mdx?collection=docs'
import * as __fd_glob_34 from '../content/docs/using-sippy/send-modes.mdx?collection=docs'
import * as __fd_glob_33 from '../content/docs/using-sippy/recovery-email.mdx?collection=docs'
import * as __fd_glob_32 from '../content/docs/using-sippy/limits.mdx?collection=docs'
import * as __fd_glob_31 from '../content/docs/using-sippy/invite-someone.mdx?collection=docs'
import * as __fd_glob_30 from '../content/docs/using-sippy/balance-history.mdx?collection=docs'
import * as __fd_glob_29 from '../content/docs/using-sippy/add-funds.mdx?collection=docs'
import * as __fd_glob_28 from '../content/docs/trust/what-sippy-is-not.mdx?collection=docs'
import * as __fd_glob_27 from '../content/docs/trust/security.mdx?collection=docs'
import * as __fd_glob_26 from '../content/docs/trust/recovery.mdx?collection=docs'
import * as __fd_glob_25 from '../content/docs/trust/money-safety.mdx?collection=docs'
import * as __fd_glob_24 from '../content/docs/trust/fees-limits.mdx?collection=docs'
import * as __fd_glob_23 from '../content/docs/faq/troubleshooting.mdx?collection=docs'
import * as __fd_glob_22 from '../content/docs/faq/support.mdx?collection=docs'
import * as __fd_glob_21 from '../content/docs/faq/common-questions.mdx?collection=docs'
import * as __fd_glob_20 from '../content/docs/start/what-is-sippy.mdx?collection=docs'
import * as __fd_glob_19 from '../content/docs/start/supported-countries.mdx?collection=docs'
import * as __fd_glob_18 from '../content/docs/start/how-it-works.mdx?collection=docs'
import * as __fd_glob_17 from '../content/docs/start/get-started.mdx?collection=docs'
import * as __fd_glob_16 from '../content/docs/legal/terms.mdx?collection=docs'
import * as __fd_glob_15 from '../content/docs/legal/risks.mdx?collection=docs'
import * as __fd_glob_14 from '../content/docs/legal/privacy.mdx?collection=docs'
import * as __fd_glob_13 from '../content/docs/behind-sippy/why-whatsapp.mdx?collection=docs'
import * as __fd_glob_12 from '../content/docs/behind-sippy/why-digital-dollars.mdx?collection=docs'
import * as __fd_glob_11 from '../content/docs/behind-sippy/why-arbitrum.mdx?collection=docs'
import * as __fd_glob_10 from '../content/docs/behind-sippy/principles.mdx?collection=docs'
import * as __fd_glob_9 from '../content/docs/index.pt.mdx?collection=docs'
import * as __fd_glob_8 from '../content/docs/index.mdx?collection=docs'
import * as __fd_glob_7 from '../content/docs/index.es.mdx?collection=docs'
import { default as __fd_glob_6 } from '../content/docs/using-sippy/meta.json?collection=docs'
import { default as __fd_glob_5 } from '../content/docs/trust/meta.json?collection=docs'
import { default as __fd_glob_4 } from '../content/docs/start/meta.json?collection=docs'
import { default as __fd_glob_3 } from '../content/docs/faq/meta.json?collection=docs'
import { default as __fd_glob_2 } from '../content/docs/legal/meta.json?collection=docs'
import { default as __fd_glob_1 } from '../content/docs/behind-sippy/meta.json?collection=docs'
import { default as __fd_glob_0 } from '../content/docs/meta.json?collection=docs'
import { server } from 'fumadocs-mdx/runtime/server'
import type * as Config from '../source.config'

const create = server<
  typeof Config,
  import('fumadocs-mdx/runtime/types').InternalTypeConfig & {
    DocData: {}
  }
>({ doc: { passthroughs: ['extractedReferences'] } })

export const docs = await create.docs(
  'docs',
  'content/docs',
  {
    'meta.json': __fd_glob_0,
    'behind-sippy/meta.json': __fd_glob_1,
    'legal/meta.json': __fd_glob_2,
    'faq/meta.json': __fd_glob_3,
    'start/meta.json': __fd_glob_4,
    'trust/meta.json': __fd_glob_5,
    'using-sippy/meta.json': __fd_glob_6,
  },
  {
    'index.es.mdx': __fd_glob_7,
    'index.mdx': __fd_glob_8,
    'index.pt.mdx': __fd_glob_9,
    'behind-sippy/principles.mdx': __fd_glob_10,
    'behind-sippy/why-arbitrum.mdx': __fd_glob_11,
    'behind-sippy/why-digital-dollars.mdx': __fd_glob_12,
    'behind-sippy/why-whatsapp.mdx': __fd_glob_13,
    'legal/privacy.mdx': __fd_glob_14,
    'legal/risks.mdx': __fd_glob_15,
    'legal/terms.mdx': __fd_glob_16,
    'start/get-started.mdx': __fd_glob_17,
    'start/how-it-works.mdx': __fd_glob_18,
    'start/supported-countries.mdx': __fd_glob_19,
    'start/what-is-sippy.mdx': __fd_glob_20,
    'faq/common-questions.mdx': __fd_glob_21,
    'faq/support.mdx': __fd_glob_22,
    'faq/troubleshooting.mdx': __fd_glob_23,
    'trust/fees-limits.mdx': __fd_glob_24,
    'trust/money-safety.mdx': __fd_glob_25,
    'trust/recovery.mdx': __fd_glob_26,
    'trust/security.mdx': __fd_glob_27,
    'trust/what-sippy-is-not.mdx': __fd_glob_28,
    'using-sippy/add-funds.mdx': __fd_glob_29,
    'using-sippy/balance-history.mdx': __fd_glob_30,
    'using-sippy/invite-someone.mdx': __fd_glob_31,
    'using-sippy/limits.mdx': __fd_glob_32,
    'using-sippy/recovery-email.mdx': __fd_glob_33,
    'using-sippy/send-modes.mdx': __fd_glob_34,
    'using-sippy/send-money.mdx': __fd_glob_35,
    'using-sippy/settings-privacy.mdx': __fd_glob_36,
    'using-sippy/setup-wallet.mdx': __fd_glob_37,
  }
)

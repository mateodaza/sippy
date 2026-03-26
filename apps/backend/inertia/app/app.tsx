/// <reference path="../../adonisrc.ts" />
/// <reference path="../../config/auth.ts" />
/// <reference path="../../config/inertia.ts" />

import './app.css'
import { createInertiaApp } from '@inertiajs/react'
import { createRoot } from 'react-dom/client'
import { resolvePageComponent } from '@adonisjs/inertia/helpers'
import { TuyauProvider } from '@adonisjs/inertia/react'
import { createTuyau } from '@tuyau/client'

const tuyau = createTuyau({ baseUrl: window.location.origin })

createInertiaApp({
  title: (title) => (title ? `${title} — Sippy Admin` : 'Sippy Admin'),
  resolve: (name) => {
    return resolvePageComponent(`../pages/${name}.tsx`, import.meta.glob('../pages/**/*.tsx'))
  },
  setup({ el, App, props }) {
    createRoot(el).render(
      <TuyauProvider client={tuyau}>
        <App {...props} />
      </TuyauProvider>
    )
  },
})

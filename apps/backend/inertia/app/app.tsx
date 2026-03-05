/// <reference path="../../adonisrc.ts" />
/// <reference path="../../config/auth.ts" />
/// <reference path="../../config/inertia.ts" />

import './app.css'
import { createInertiaApp } from '@inertiajs/react'
import { createRoot } from 'react-dom/client'
import { resolvePageComponent } from '@adonisjs/inertia/helpers'

createInertiaApp({
  title: (title) => (title ? `${title} — Sippy Admin` : 'Sippy Admin'),
  resolve: (name) => {
    return resolvePageComponent(`../pages/${name}.tsx`, import.meta.glob('../pages/**/*.tsx'))
  },
  setup({ el, App, props }) {
    createRoot(el).render(<App {...props} />)
  },
})

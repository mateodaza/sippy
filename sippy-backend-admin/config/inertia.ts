import { defineConfig } from '@adonisjs/inertia'

const inertiaConfig = defineConfig({
  rootView: 'inertia_layout',
})

export default inertiaConfig

declare module '@adonisjs/inertia/types' {
  export interface SharedProps {
    auth: {
      id: number
      email: string
      fullName: string
      role: string
      initials: string
    } | null
    flash: {
      success?: string
      error?: string
    }
  }
  export interface InertiaPages {
    [key: string]: Record<string, any>
  }
}

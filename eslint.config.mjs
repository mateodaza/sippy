import js from '@eslint/js'

/** @type {import("eslint").Linter.Config[]} */
export default [
  js.configs.recommended,
  {
    ignores: ['node_modules/', 'apps/', 'packages/', '.turbo/'],
  },
]

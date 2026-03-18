/** @type {import("@commitlint/types").UserConfig} */
const config = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      ['backend', 'web', 'fund', 'indexer', 'x-agent', 'shared', 'deps', 'ci', 'repo'],
    ],
    'scope-empty': [1, 'never'],
    'subject-case': [0],
    'header-max-length': [2, 'always', 100],
  },
}

export default config

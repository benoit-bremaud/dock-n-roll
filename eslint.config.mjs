import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

// ESLint resolves flat config through the default export (tool constraint).
export default tseslint.config(
  { ignores: ['out/', 'dist/', 'node_modules/'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      // Named exports only (owner rule); config files below are the tool-imposed exceptions.
      'no-restricted-exports': ['error', { restrictDefaultExports: { direct: true, named: true, defaultFrom: true, namedFrom: true, namespaceFrom: true } }]
    }
  },
  {
    // Dependency rule (03-component.md): the domain imports nothing from Electron, Docker or Node IO.
    files: ['src/main/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: ['electron', 'dockerode', 'node:*', 'fs', 'child_process', 'path', 'os', 'yaml', '../*'] }]
    }
  },
  {
    // Adapters are plain Node over one OS boundary each: no Electron, so they run under Vitest.
    files: ['src/main/adapters/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: ['electron', '**/renderer/**', '**/preload/**'] }]
    }
  },
  {
    files: ['src/renderer/**/*.tsx'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules
  },
  {
    files: ['*.config.ts', '*.config.mjs'],
    rules: { 'no-restricted-exports': 'off' }
  },
  {
    files: ['*.config.mjs'],
    ...tseslint.configs.disableTypeChecked
  }
)

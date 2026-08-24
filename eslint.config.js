import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const activeFiles = [
  'src/main.tsx',
  'src/App.tsx',
  'src/local-foundation/**/*.{ts,tsx}',
  'vite.config.ts',
  'vitest.config.ts',
];

export default tseslint.config(
  {
    ignores: [
      'coverage/**',
      'dist/**',
      'node_modules/**',
      'src/components/**',
      'src/config/**',
      'src/foundation/**',
      'src/integration/**',
      'src/prototype/**',
      'src/utils/**',
    ],
  },
  {
    ...js.configs.recommended,
    files: activeFiles,
  },
  ...tseslint.configs.recommended.map((config) => ({...config, files: activeFiles})),
  {
    files: activeFiles,
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      'no-undef': 'off',
      'no-unused-vars': 'off',
      'no-useless-assignment': 'warn',
      'prefer-const': 'warn',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', {allowConstantExport: true}],
    },
  },
);

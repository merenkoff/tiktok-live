/* Flat-config is used by admin/ but that stack is eslint-9-only; pos/ mirrors the
   repo-root eslint 8 + @typescript-eslint v8 setup instead (see repo CLAUDE.md). */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  env: {
    browser: true,
    es2021: true,
  },
  plugins: ['@typescript-eslint', 'react-hooks', 'react-refresh'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: [
    'dist',
    'dist-cashier',
    'dist-remotes',
    'dist-remote-demo',
    'dist-vendor',
    'src-tauri',
    'coverage',
    'playwright-report',
    'test-results',
    'node_modules',
    '*.config.ts',
    'scripts/**',
  ],
  rules: {
    // TypeScript's own checker owns undefined-symbol / no-undef.
    'no-undef': 'off',
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
    ],
    '@typescript-eslint/no-explicit-any': 'off',
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
  },
  overrides: [
    {
      files: ['src/**/*.{test,spec}.{ts,tsx}', 'src/test/**', 'src/**/__tests__/**'],
      env: { node: true },
    },
  ],
};

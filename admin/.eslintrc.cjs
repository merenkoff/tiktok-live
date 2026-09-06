/* Same eslint 8 + @typescript-eslint v8 setup as the repo root and pos/. */
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
    'dist-ssr',
    'coverage',
    'playwright-report',
    'test-results',
    'blob-report',
    'node_modules',
    '*.config.ts',
    '*.config.js',
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

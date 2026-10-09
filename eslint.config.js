import globals from 'globals';

export default [
  {
    files: ['frontend/js/**/*.js', 'frontend/app/js/**/*.js', 'shared/**/*.js', 'scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': 'warn',
      'no-console': 'off',
    },
  },
  {
    ignores: ['node_modules/**', 'frontend/js/vendor/**', 'dist/**'],
  },
];

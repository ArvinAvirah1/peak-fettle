module.exports = {
  extends: ['expo', 'prettier'],
  rules: {
    // Disallow `any` to keep TypeScript meaningful.
    '@typescript-eslint/no-explicit-any': 'warn',
    // Prefer const assertions.
    'prefer-const': 'error',
  },
};

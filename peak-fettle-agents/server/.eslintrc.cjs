// ESLint config for the Peak Fettle API server (CommonJS).
// The parent peak-fettle-agents package uses "type":"module" (ESM), so
// this file lives here to scope CJS rules to the server directory only.
module.exports = {
    env: {
        node:  true,
        es2022: true,
        jest:  true,
    },
    extends: ['eslint:recommended'],
    parserOptions: { ecmaVersion: 2022 },
    rules: {
        // Allow unused args when prefixed with _ (common in Express middleware)
        'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
        // console.log is fine in a server context
        'no-console': 'off',
    },
    ignorePatterns: ['node_modules/'],
};

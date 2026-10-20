export const DEFAULT_SETTINGS = Object.freeze({
  mode: 'auto',
  agentUsage: 'smart',
  scope: 'sessions',
  allowlist: [],
  debounceSeconds: 3,
  excludePatterns: ['node_modules/', 'dist/', 'build/', 'coverage/', '.env*', 'secrets/', '*.pem', '*.key'],
})

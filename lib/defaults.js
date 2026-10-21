export const DEFAULT_SETTINGS = Object.freeze({
  mode: 'auto',
  agentUsage: 'smart',
  advancedActions: false,
  networkActions: false,
  scope: 'sessions',
  allowlist: [],
  debounceSeconds: 20,
  minIntervalSeconds: 180,
  excludePatterns: ['node_modules/', 'dist/', 'build/', 'coverage/', '.env*', 'secrets/', '*.pem', '*.key'],
})

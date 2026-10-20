import Schema from '@deepseek-ai/schemastery'

/** Native DSH Host settings. All fields use volatile references: changes do
 * not remount the plugin and never execute arbitrary Agent commands. */
export const DEFAULT_SETTINGS = Object.freeze({
  mode: 'auto',
  scope: 'sessions',
  allowlist: [],
  debounceSeconds: 3,
  excludePatterns: ['node_modules/', 'dist/', 'build/', 'coverage/', '.env*', 'secrets/', '*.pem', '*.key'],
})
export const Config = Schema.object({
  mode: Schema.union(['auto', 'open', 'manual', 'off']).default('auto').volatile(),
  scope: Schema.union(['sessions', 'allowlist']).default('sessions').volatile(),
  allowlist: Schema.array(Schema.string()).default([]).volatile(),
  debounceSeconds: Schema.number().min(1).max(15).step(1).default(3).volatile(),
  excludePatterns: Schema.array(Schema.string()).default(DEFAULT_SETTINGS.excludePatterns).volatile(),
})
function val(config, name) {
  const ref = config?.[name]
  return ref && typeof ref.get === 'function' ? ref.get() : DEFAULT_SETTINGS[name]
}
export function readSettings(config) {
  const mode = val(config, 'mode')
  const scope = val(config, 'scope')
  const allowlist = val(config, 'allowlist')
  const excludePatterns = val(config, 'excludePatterns')
  const debounceSeconds = val(config, 'debounceSeconds')
  return {
    mode: ['auto', 'open', 'manual', 'off'].includes(mode) ? mode : 'manual',
    scope: scope === 'allowlist' ? 'allowlist' : 'sessions',
    allowlist: Array.isArray(allowlist) ? allowlist.filter(s => typeof s === 'string' && s.length < 1024).slice(0, 60) : [],
    debounceSeconds: Number.isInteger(debounceSeconds) && debounceSeconds >= 1 && debounceSeconds <= 15 ? debounceSeconds : 3,
    excludePatterns: Array.isArray(excludePatterns)
      ? excludePatterns.filter(s => typeof s === 'string' && s.trim().length > 0 && s.length <= 200 && !s.startsWith('!')).slice(0, 60)
      : [...DEFAULT_SETTINGS.excludePatterns],
  }
}

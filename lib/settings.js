import Schema from '@deepseek-ai/schemastery'

/** Native DSH Host settings. All fields use volatile references: changes do
 * not remount the plugin and never execute arbitrary Agent commands. */
import { DEFAULT_SETTINGS } from './defaults.js'
export { DEFAULT_SETTINGS } from './defaults.js'
export const Config = Schema.object({
  mode: Schema.union(['auto', 'open', 'manual', 'off']).default('auto').volatile(),
  agentUsage: Schema.union(['smart', 'on-request', 'off']).default('smart').volatile(),
  advancedActions: Schema.boolean().default(false).volatile(),
  networkActions: Schema.boolean().default(false).volatile(),
  scope: Schema.union(['sessions', 'allowlist']).default('sessions').volatile(),
  allowlist: Schema.array(Schema.string()).default([]).volatile(),
  debounceSeconds: Schema.number().min(5).max(120).step(1).default(20).volatile(),
  minIntervalSeconds: Schema.number().min(30).max(900).step(10).default(180).volatile(),
  excludePatterns: Schema.array(Schema.string()).default(DEFAULT_SETTINGS.excludePatterns).volatile(),
})
function val(config, name) {
  const ref = config?.[name]
  return ref && typeof ref.get === 'function' ? ref.get() : DEFAULT_SETTINGS[name]
}
export function readSettings(config) {
  const mode = val(config, 'mode')
  const agentUsage = val(config, 'agentUsage')
  const advancedActions = val(config, 'advancedActions')
  const networkActions = val(config, 'networkActions')
  const scope = val(config, 'scope')
  const allowlist = val(config, 'allowlist')
  const excludePatterns = val(config, 'excludePatterns')
  const debounceSeconds = val(config, 'debounceSeconds')
  const minIntervalSeconds = val(config, 'minIntervalSeconds')
  return {
    mode: ['auto', 'open', 'manual', 'off'].includes(mode) ? mode : 'manual',
    agentUsage: ['smart', 'on-request', 'off'].includes(agentUsage) ? agentUsage : 'off',
    advancedActions: advancedActions === true,
    networkActions: networkActions === true && advancedActions === true,
    scope: scope === 'allowlist' ? 'allowlist' : 'sessions',
    allowlist: Array.isArray(allowlist) ? allowlist.filter(s => typeof s === 'string' && s.length < 1024).slice(0, 60) : [],
    debounceSeconds: Number.isInteger(debounceSeconds) && debounceSeconds >= 5 && debounceSeconds <= 120 ? debounceSeconds : 20,
    minIntervalSeconds: Number.isInteger(minIntervalSeconds) && minIntervalSeconds >= 30 && minIntervalSeconds <= 900 ? minIntervalSeconds : 180,
    excludePatterns: Array.isArray(excludePatterns)
      ? excludePatterns.filter(s => typeof s === 'string' && s.trim().length > 0 && s.length <= 200 && !s.startsWith('!')).slice(0, 60)
      : [...DEFAULT_SETTINGS.excludePatterns],
  }
}

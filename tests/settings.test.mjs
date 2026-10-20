import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
const original=readFileSync(resolve(root,'src/settings.js'),'utf8')
const mock=original
  .replace("import Schema from '@deepseek-ai/schemastery'","const Schema = { object: value => value, union: value => ({default: () => ({volatile: () => value})}), number: () => ({min(){return this},max(){return this},step(){return this},default(){return this},volatile(){return this}}), array: () => ({default(){return this},volatile(){return this}}), string: () => ({}) }")
  .replace("import { DEFAULT_SETTINGS } from './defaults.js'", "const DEFAULT_SETTINGS = {mode:'auto',agentUsage:'smart',scope:'sessions',allowlist:[],debounceSeconds:20,minIntervalSeconds:180,excludePatterns:['node_modules/','.env*']}")
  .replace("export { DEFAULT_SETTINGS } from './defaults.js'", "export { DEFAULT_SETTINGS }")
const settings=await import('data:text/javascript,'+encodeURIComponent(mock))
const ref = value => ({get:()=>value})
test('Host settings default to on-device, code-only automatic indexing',()=>{
  const value=settings.readSettings(undefined)
  assert.equal(value.mode,'auto')
  assert.equal(value.agentUsage,'smart')
  assert.equal(value.scope,'sessions')
  assert.equal(value.debounceSeconds,20)
  assert.equal(value.minIntervalSeconds,180)
  assert.ok(value.excludePatterns.includes('.env*'))
})
test('live DSH volatile config references are read for each indexing operation',()=>{
  const conf={mode:ref('manual'),agentUsage:ref('on-request'),scope:ref('allowlist'),allowlist:ref(['C:\\code\\alpha']),debounceSeconds:ref(45),minIntervalSeconds:ref(420),excludePatterns:ref(['private/','*.key'])}
  const first=settings.readSettings(conf)
  assert.equal(first.mode,'manual')
  assert.equal(first.agentUsage,'on-request')
  assert.deepEqual(first.allowlist,['C:\\code\\alpha'])
  assert.equal(first.debounceSeconds,45)
  assert.equal(first.minIntervalSeconds,420)
  assert.deepEqual(first.excludePatterns,['private/','*.key'])
  conf.mode=ref('off')
  assert.equal(settings.readSettings(conf).mode,'off')
})
test('settings sanitizer refuses invalid runtime execution controls',()=>{
  const conf={mode:ref('launch-anything'),agentUsage:ref('unsafe'),scope:ref('all-files'),allowlist:ref([null,77]),debounceSeconds:ref(0),minIntervalSeconds:ref(-5),excludePatterns:ref(['!secret/','good/',...Array(80).fill('many/'),'*'.repeat(300)])}
  const value=settings.readSettings(conf)
  assert.equal(value.mode,'manual')
  assert.equal(value.agentUsage,'off')
  assert.equal(value.scope,'sessions')
  assert.equal(value.debounceSeconds,3)
  assert.deepEqual(value.allowlist,[])
  assert.equal(value.excludePatterns.length,60)
  assert.equal(value.excludePatterns.includes('!secret/'),false)
})

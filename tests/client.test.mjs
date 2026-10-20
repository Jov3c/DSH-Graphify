import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const body = readFileSync(resolve(root, 'src/client.js'), 'utf8')
function mockReact() {
  return { createElement() {}, useCallback() {}, useEffect() {}, useMemo() {}, useRef() {}, useState() {} }
}
function loadClient() {
  const module = { exports: {} }
  vm.runInNewContext(`(function(require, module, exports){${body}\n})`, {})(name => {
    if (name === 'react') return mockReact()
    throw Error(`Unknown dependency ${name}`)
  }, module, module.exports)
  return module.exports
}
test('client exports apply + inject and uses official sidebar extension', async () => {
  const api = loadClient()
  assert.equal(typeof api.apply, 'function')
  assert.ok(api.inject.includes('remote.workspaceFiles'))
  let definition = null, slot = null
  const reads = []
  const ctx = {
    sidebarRightTabs: { register(obj) { definition = obj; return () => {} } },
    slots: { inject(_name, cb) { cb(); return () => {} }, register(obj, component) { slot = { obj, component }; return () => {} } },
    effect(fn) { fn() },
    configForms: { get: id => ({ id, getSnapshot: () => ({status:'ready',writable:true,revision:1,value:{mode:'auto',scope:'sessions'}}), subscribe: () => () => {}, mutate: async () => true }) },
    remote: { workspaceFiles: { readBytes: async (id, path) => { reads.push({id, path}); return { ok: true, value: { data: new Uint8Array([123, 125]) } } } } },
  }
  api.apply(ctx)
  assert.equal(definition.kind, 'graphify')
  assert.equal(definition.guide[0].id, 'graphify.open')
  assert.equal(slot.obj.key, '@jov3c/dsh-graphify')
  assert.equal(typeof slot.component, 'function')
  const injected = slot.obj.inject('my-session')
  assert.equal(typeof injected.loadGraph, 'function')
  assert.equal(typeof injected.loadStatus, 'function')
  assert.equal(typeof injected.loadHtml, 'function')
  assert.equal(injected.settingsForm.id,'dsh-graphify')
  assert.ok(api.inject.includes('configForms'))
  assert.deepEqual([...await injected.loadGraph()], [123, 125])
  assert.deepEqual([...await injected.loadStatus()], [123, 125])
  assert.deepEqual([...await injected.loadHtml()], [123, 125])
  assert.deepEqual(reads, [
    { id: 'my-session', path: 'graphify-out/graph.json' },
    { id: 'my-session', path: 'graphify-out/.dsh-graphify-status.json' },
    { id: 'my-session', path: 'graphify-out/graph.html' },
  ])
})
test('prebuilt client is self-registering DSH factory', () => {
  const bundle = readFileSync(resolve(root, 'lib/client.js'), 'utf8')
  let result = null
  vm.runInNewContext(bundle, { window: { __ModuleLoader__: { load: descriptor => { result = descriptor } } } })
  assert.equal(result.id, '@jov3c/dsh-graphify')
  assert.equal(typeof result.factory, 'function')
  const plugin = result.factory(name => name === 'react' ? mockReact() : null)
  assert.equal(typeof plugin.apply, 'function')
})

test('original Graphify HTML is embedded without replacing original force-directed renderer', () => {
  const { originalGraphDocument } = loadClient().__test
  const html = '<!DOCTYPE html><html><head><script src="https://unpkg.com/vis-network@9.1.6/standalone/umd/vis-network.min.js" integrity="sha384-Ux6phic9PEHJ38YtrijhkzyJ8yQlH8i/+buBR8s3mAZOJrP1gwyvAcIYl3GWtpX1"></script></head><body><div id="graph"></div><div id="sidebar"></div><script>const network = new vis.Network(1,2,3)</script></body></html>'
  const result=originalGraphDocument(html)
  assert.ok(result.includes('new vis.Network(1,2,3)'))
  assert.ok(result.includes('<meta http-equiv="Content-Security-Policy"'))
  assert.ok(result.includes("connect-src 'none'"))
  assert.ok(result.includes('https://unpkg.com/vis-network@9.1.6'))
  assert.throws(()=>originalGraphDocument('<html><head></head><body></body></html>'), /recognized Graphify/)
  assert.throws(()=>originalGraphDocument(html.replace('</head>', '<script src="https://evil.example/attack.js"></script></head>')), /unexpected external script/)
  const app = readFileSync(resolve(root,'src/client.js'),'utf8')
  assert.ok(app.includes("sandbox: 'allow-scripts'"))
  assert.ok(!app.includes('function GraphCanvas'))
  assert.ok(!app.includes('allow-same-origin'))
})

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
const { normaliseGraph, layoutGraph, shortestPath } = loadClient().__test
const fixture = {
  directed: false,
  nodes: [
    { id: 'Auth', label: 'Auth', community: 1, source_file: 'auth.py' },
    { id: 'Login', label: 'Login', community: 1 },
    { id: 'DB', label: 'Database', community: 2 },
    { id: 'Unused', label: 'Unused', community: 3 },
  ],
  links: [
    { source: 'Auth', target: 'Login', relation: 'calls' },
    { source: 'Login', target: 'DB', relation: 'uses' },
    { source: 'DB', target: 'NOPE' },
  ],
}
test('normalises node-link graph and drops unknown edges', () => {
  const result = normaliseGraph(fixture)
  assert.equal(result.nodes.length, 4)
  assert.equal(result.links.length, 2)
  assert.equal(result.nodes[0].source, 'auth.py')
  assert.equal(result.nodes[0].community, '1')
  assert.equal(result.totalLinks, 3)
})
test('shortest undirected path', () => {
  const graph = normaliseGraph(fixture)
  assert.equal(JSON.stringify(shortestPath(graph, 'Auth', 'DB')), JSON.stringify(['Auth','Login','DB']))
  assert.equal(JSON.stringify(shortestPath(graph, 'Auth', 'Unused')), JSON.stringify([]))
})
test('layout is deterministic and finite', () => {
  const graph = normaliseGraph(fixture)
  const p = layoutGraph(graph)
  assert.equal(p.size, 4)
  for (const [, xy] of p) { assert.ok(Number.isFinite(xy.x)); assert.ok(Number.isFinite(xy.y)) }
})
test('broken graph is rejected', () => assert.throws(() => normaliseGraph({nodes: []}), /No nodes/))
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
    remote: { workspaceFiles: { readBytes: async (id, path) => { reads.push({id, path}); return { data: new Uint8Array() } } } },
  }
  api.apply(ctx)
  assert.equal(definition.kind, 'graphify')
  assert.equal(definition.guide[0].id, 'graphify.open')
  assert.equal(slot.obj.key, '@jov3c/dsh-graphify')
  assert.equal(typeof slot.component, 'function')
  const injected = slot.obj.inject('my-session')
  assert.equal(typeof injected.loadGraph, 'function')
  assert.equal(typeof injected.loadStatus, 'function')
  await injected.loadGraph()
  await injected.loadStatus()
  assert.deepEqual(reads, [
    { id: 'my-session', path: 'graphify-out/graph.json' },
    { id: 'my-session', path: 'graphify-out/.dsh-graphify-status.json' },
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

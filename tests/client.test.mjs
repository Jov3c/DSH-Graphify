import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { fileURLToPath, URL } from 'node:url'
import { resolve, dirname } from 'node:path'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const body = readFileSync(resolve(root, 'src/client.js'), 'utf8')
function mockReact() {
  return { createElement() {}, useCallback() {}, useEffect() {}, useMemo() {}, useRef() {}, useState() {} }
}
function loadClient() {
  const module = { exports: {} }
  vm.runInNewContext(`(function(require, module, exports){${body}\n})`, { URL })(name => {
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
  assert.equal(typeof injected.loadTree, 'function')
  assert.equal(typeof injected.loadCallflow, 'function')
  assert.equal(injected.settingsForm.id,'dsh-graphify')
  assert.ok(api.inject.includes('configForms'))
  assert.deepEqual([...await injected.loadGraph()], [123, 125])
  assert.deepEqual([...await injected.loadStatus()], [123, 125])
  assert.deepEqual([...await injected.loadHtml()], [123, 125])
  assert.deepEqual([...await injected.loadTree()], [123, 125])
  assert.deepEqual([...await injected.loadCallflow()], [123, 125])
  assert.deepEqual(reads, [
    { id: 'my-session', path: 'graphify-out/graph.json' },
    { id: 'my-session', path: 'graphify-out/.dsh-graphify-status.json' },
    { id: 'my-session', path: 'graphify-out/graph.html' },
    { id: 'my-session', path: 'graphify-out/GRAPH_TREE.html' },
    { id: 'my-session', path: 'graphify-out/GRAPH_CALLFLOW.html' },
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
  const html = [
    '<!DOCTYPE html><html><head>',
    '<script src="https://unpkg.com/vis-network@9.1.6/standalone/umd/vis-network.min.js" integrity="sha384-Ux6phic9PEHJ38YtrijhkzyJ8yQlH8i/+buBR8s3mAZOJrP1gwyvAcIYl3GWtpX1"></script>',
    '<script id="graphify-theme-init">(function () { var pref = null; try { pref = localStorage.getItem(\'graphify-theme\'); } catch (e) {} var t = pref === \'light\' ? \'light\' : pref === \'system\' && window.matchMedia && window.matchMedia(\'(prefers-color-scheme: light)\').matches ? \'light\' : \'dark\'; document.documentElement.setAttribute(\'data-theme\',t); })();</script>',
    '</head><body><div id="graph"></div><div id="sidebar"></div>',
    '<script>const THEME_KEY = \'graphify-theme\'; function themePref() { let p = null; try { p = localStorage.getItem(THEME_KEY); } catch (e) {} return (p === \'light\' || p === \'dark\' || p === \'system\') ? p : null; } document.querySelectorAll(\'[data-theme-choice]\').forEach(b => { b.addEventListener(\'click\', () => { const pref = b.dataset.themeChoice; applyTheme(pref); }); }); const network = new vis.Network(1,2,3)</script>',
    '</body></html>',
  ].join('')
  const result=originalGraphDocument(html)
  assert.ok(result.includes('new vis.Network(1,2,3)'))
  assert.ok(result.includes("var pref = 'system';"))
  assert.ok(result.includes("|| 'system'"))
  assert.ok(result.includes("transientThemePreference = 'system'"))
  assert.ok(result.includes("transientThemePreference = pref"))
  assert.ok(result.includes("? p : transientThemePreference;"))
  const init=result.match(/<script id="graphify-theme-init">([\s\S]*?)<\/script>/)[1]
  for(const [osLight, expected] of [[true,'light'],[false,'dark']]) {
    let chosen = null
    vm.runInNewContext(init, {
      window:{ matchMedia:()=>({matches:osLight}) },
      localStorage:{ getItem(){throw Error('opaque sandbox storage denied')} },
      document:{ documentElement:{ setAttribute(_key,value){chosen=value} } },
    })
    assert.equal(chosen, expected, 'initial Graphify appearance should match the operating system')
  }
  let chosen = null
  vm.runInNewContext(init, {
    window:{matchMedia:()=>({matches:false})},
    localStorage:{getItem(){return 'light'}},
    document:{ documentElement:{ setAttribute(_key,value){chosen=value} } },
  })
  assert.equal(chosen,'light','supported manual theme preference should still override system')

  assert.ok(result.includes('<meta http-equiv="Content-Security-Policy"'))
  assert.ok(result.includes("connect-src 'none'"))
  assert.ok(result.includes('https://unpkg.com/vis-network@9.1.6'))
  assert.throws(()=>originalGraphDocument('<html><head></head><body></body></html>'), /recognized Graphify/)
  assert.throws(()=>originalGraphDocument(html.replace('</head>', '<script src="https://evil.example/attack.js"></script></head>')), /unexpected external script/)
  const app = readFileSync(resolve(root,'src/client.js'),'utf8')
  assert.ok(app.includes("sandbox: 'allow-scripts'"))
  assert.ok(!app.includes('function GraphCanvas'))
  assert.ok(!app.includes('allow-same-origin'))
  assert.ok(app.includes("background: 'transparent'"), 'do not force black loading background')
})

test('background revisions never replace a viewed graph until user explicitly refreshes',()=>{
  const {graphRefreshAction}=loadClient().__test
  assert.equal(graphRefreshAction(null,null,false,false),'none')
  assert.equal(graphRefreshAction(null,'v1',false,false),'reload')
  assert.equal(graphRefreshAction(null,'v1',true,false),'none')
  assert.equal(graphRefreshAction('v1','v1',true,true),'none')
  assert.equal(graphRefreshAction('v1','v2',true,true),'notify')
  assert.equal(graphRefreshAction('v2','v3',false,true),'reload')
  const code=readFileSync(resolve(root,'src/client.js'),'utf8')
  assert.ok(code.includes('图谱已更新；为保留当前缩放'))
  assert.ok(code.includes('加载最新图谱'))
  assert.ok(!code.includes('value.updatedAt !== lastReady'))
  assert.ok(code.includes("display:showSettings?'none':'flex'"))
})

test('only recognized upstream tree and callflow HTML can run in the isolated iframe',()=>{
  const {prepareGraphDocument} = loadClient().__test
  for(const [view,url,body] of [
    ['tree','https://d3js.org/d3.v7.min.js','d3.hierarchy(x); d3.tree();'],
    ['callflow','https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js','mermaid.initialize(config); <div class="mermaid"></div>'],
  ]){
    const html='<html><head><script src="'+url+'"></script></head><body><script>'+body+'</script></body></html>'
    const safe=prepareGraphDocument(html,view)
    assert.ok(safe.includes('Content-Security-Policy'))
    assert.ok(safe.includes("connect-src 'none'"))
    assert.ok(safe.includes(url))
    assert.throws(()=>prepareGraphDocument(html.replace('</head>','<script src="https://evil.example/malware.js"></script></head>'),view),/Unexpected external script/)
  }
  assert.throws(()=>prepareGraphDocument('<html><head></head><body></body></html>','tree'),/Unrecognized original/)
})

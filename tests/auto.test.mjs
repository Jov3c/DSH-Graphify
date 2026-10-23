import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, relative, resolve, isAbsolute } from 'node:path'
import { tmpdir } from 'node:os'
import { classifyChange, createAutoGraphManager, excluded, allowedProject } from '../src/auto.js'

const wait = ms => new Promise(done => setTimeout(done, ms))
async function waitFor(predicate, timeout = 3000) {
  const until = Date.now() + timeout
  while (!predicate()) {
    if (Date.now() > until) throw new Error('background indexing test timed out')
    await wait(15)
  }
}
const session = (id, cwd) => ({ id, header: { cwd } })
function fakeWatcher() {
  const entries = []
  const watchImpl = (root, options, onChange) => {
    assert.equal(options.recursive, true)
    const w = {
      root,
      closed: false,
      on: () => {},
      emit: name => onChange('change', name),
      close() { this.closed = true },
    }
    entries.push(w)
    return w
  }
  return { entries, watchImpl }
}
function isHtmlExport(args) {
  return args[0] === 'export' && args[1] === 'html'
}
function makeRunner(calls) {
  return async (args, root) => {
    if (isHtmlExport(args)) return 'html'
    calls.push([...args])
    await mkdir(join(root, 'graphify-out'), { recursive: true })
    await writeFile(join(root, 'graphify-out', 'graph.json'), JSON.stringify({ nodes: [{ id: 'test' }], links: [] }))
    return 'complete'
  }
}
function permitted(base) {
  return async (_sandboxRoot, path) => {
    const pathString = resolve(base, path)
    const rel = relative(base, pathString)
    if (rel === '..' || rel.startsWith('..\\') || rel.startsWith('../') || isAbsolute(rel)) throw new Error('outside workspace')
    return pathString
  }
}

test('change classifier ignores generated output and dependencies', () => {
  assert.equal(classifyChange('graphify-out/graph.json'), 'ignore')
  assert.equal(classifyChange('node_modules/foo.ts'), 'ignore')
  assert.equal(classifyChange('.git/HEAD'), 'ignore')
  assert.equal(classifyChange('src/hello.ts'), 'code')
  assert.equal(classifyChange('.graphifyignore'), 'code')
  assert.equal(classifyChange('.gitignore'), 'code')
  assert.equal(classifyChange('README.md'), 'document')
  assert.equal(classifyChange('src'), 'code')
  assert.equal(classifyChange(undefined), 'code')
})

test('new session auto-builds locally; subsequent source saves debounce incremental update', async () => {
  const base = await mkdtemp(join(tmpdir(), 'dsh-gfy-auto-'))
  const watch = fakeWatcher(), calls = []
  const manager = createAutoGraphManager({
    run: makeRunner(calls), resolveProject: permitted(base), workspaceRoot: () => base,
    watchImpl: watch.watchImpl, debounceMs: 35,
  })
  try {
    await manager.attach(session('s1', base))
    await waitFor(() => calls.length === 1)
    await waitFor(async () => true)
    assert.deepEqual(calls[0].slice(0,3), ['extract', '.', '--code-only'])
    assert.ok(calls[0].includes('--exclude'))
    await waitFor(() => manager.activeProjects() === 1)
    await wait(50)
    const first = JSON.parse(await readFile(join(base, 'graphify-out', '.dsh-graphify-status.json'), 'utf8'))
    assert.equal(first.state, 'ready')
    assert.equal(first.htmlAvailable, false)
    assert.match(first.detail, /graph.html/)
    assert.equal(first.watching, true)
    watch.entries[0].emit('src/a.ts')
    watch.entries[0].emit('src/b.ts')
    watch.entries[0].emit('src/c.ts')
    await waitFor(() => calls.length === 2)
    assert.deepEqual(calls[1].slice(0,3), ['extract', '.', '--code-only'])
    await wait(80)
    assert.equal(calls.length, 2)
    watch.entries[0].emit('graphify-out/graph.json')
    watch.entries[0].emit('node_modules/pkg/index.ts')
    await wait(65)
    assert.equal(calls.length, 2)
    watch.entries[0].emit('docs/design.md')
    await wait(50)
    assert.equal(calls.length, 2)
    const note = JSON.parse(await readFile(join(base, 'graphify-out', '.dsh-graphify-status.json'), 'utf8'))
    assert.equal(note.documentsStale, true)
    manager.detach(session('s1', base))
    assert.equal(watch.entries[0].closed, true)
    assert.equal(manager.activeProjects(), 0)
  } finally { manager.stop(); await rm(base, { recursive: true, force: true }) }
})

test('two sessions of same project share exactly one watcher and build', async () => {
  const base = await mkdtemp(join(tmpdir(), 'dsh-gfy-shared-'))
  const watch = fakeWatcher(), calls = []
  const manager = createAutoGraphManager({
    run: makeRunner(calls), resolveProject: permitted(base), workspaceRoot: () => base,
    watchImpl: watch.watchImpl, debounceMs: 20,
  })
  try {
    await Promise.all([manager.attach(session('a', base)), manager.attach(session('b', base))])
    await waitFor(() => calls.length === 1)
    assert.equal(manager.activeProjects(), 1)
    assert.equal(watch.entries.length, 1)
    manager.detach(session('a', base))
    assert.equal(watch.entries[0].closed, false)
    manager.detach(session('b', base))
    assert.equal(watch.entries[0].closed, true)
  } finally { manager.stop(); await rm(base, { recursive: true, force: true }) }
})

test('session outside local workspace is never indexed', async () => {
  const base = await mkdtemp(join(tmpdir(), 'dsh-gfy-sandbox-'))
  const watch = fakeWatcher(), calls = []
  const manager = createAutoGraphManager({
    run: makeRunner(calls), resolveProject: permitted(base), workspaceRoot: () => base,
    watchImpl: watch.watchImpl, debounceMs: 25,
  })
  try {
    await manager.attach(session('bad', resolve(base, '../elsewhere')))
    assert.equal(manager.activeProjects(), 0)
    assert.equal(calls.length, 0)
    assert.equal(watch.entries.length, 0)
  } finally { manager.stop(); await rm(base, { recursive: true, force: true }) }
})

test('settings whitelist and exclusions prevent unauthorized automatic scans', async () => {
  const base = await mkdtemp(join(tmpdir(), 'dsh-gfy-control-'))
  const watch = fakeWatcher(), calls=[]
  let setting={mode:'auto',scope:'allowlist',allowlist:[],debounceSeconds:1,excludePatterns:['private/','*.pem','.env*']}
  const manager=createAutoGraphManager({run:makeRunner(calls),resolveProject:permitted(base),workspaceRoot:()=>base,
    getSettings:()=>setting,watchImpl:watch.watchImpl,debounceMs:20})
  try {
    assert.equal(allowedProject(base,setting),false)
    await manager.attach(session('x',base))
    await wait(40)
    assert.equal(calls.length,0)
    setting={...setting,allowlist:[base]}
    manager.refreshSettings()
    await waitFor(()=>calls.length===1)
    assert.ok(calls[0].includes('private/'))
    assert.ok(calls[0].includes('*.pem'))
    assert.equal(excluded('private/auth.ts',setting.excludePatterns),true)
    assert.equal(classifyChange('src/key.pem',setting.excludePatterns),'ignore')
    assert.equal(classifyChange('.env.production',setting.excludePatterns),'ignore')
    assert.equal(classifyChange('src/module.ts',setting.excludePatterns),'code')
    setting={...setting,mode:'manual'}
    manager.refreshSettings()
    await wait(50)
    assert.equal(calls.length,1)
    setting={...setting,mode:'off'}
    manager.refreshSettings()
    await wait(50)
    assert.equal(calls.length,1)
  } finally{manager.stop();await rm(base,{recursive:true,force:true})}
})

test('open-only mode creates one graph and never watches edits', async()=>{
  const base=await mkdtemp(join(tmpdir(),'dsh-gfy-open-'))
  const watch=fakeWatcher(),calls=[]
  const manager=createAutoGraphManager({run:makeRunner(calls),resolveProject:permitted(base),
    workspaceRoot:()=>base,getSettings:()=>({mode:'open',scope:'sessions',excludePatterns:[],debounceSeconds:3}),
    watchImpl:watch.watchImpl,debounceMs:15})
  try{
    await manager.attach(session('x',base))
    await waitFor(()=>calls.length===1)
    assert.equal(watch.entries.length,0)
  } finally{manager.stop();await rm(base,{recursive:true,force:true})}
})

test('ready state reports original HTML availability separately from graph data', async () => {
  const base = await mkdtemp(join(tmpdir(),'dsh-gfy-html-'))
  const watcher=fakeWatcher()
  const manager=createAutoGraphManager({
    run: async(args,root)=>{
      await mkdir(join(root,'graphify-out'),{recursive:true})
      if (isHtmlExport(args)) {
        await writeFile(join(root,'graphify-out','graph.html'),'<html></html>')
        return 'html'
      }
      await writeFile(join(root,'graphify-out','graph.json'),'{"nodes":[{"id":"x"}],"links":[]}')
      return 'extract'
    },
    resolveProject:permitted(base),workspaceRoot:()=>base,watchImpl:watcher.watchImpl,
  })
  try {
    await manager.attach(session('html',base))
    await waitFor(()=>manager.activeProjects()===1)
    await wait(90)
    const status=JSON.parse(await readFile(join(base,'graphify-out','.dsh-graphify-status.json'),'utf8'))
    assert.equal(status.state,'ready')
    assert.equal(status.htmlAvailable,true)
    assert.equal(status.viewAttempted,true)
    assert.match(status.graphRevision,/^[a-f0-9]{24}$/)
  }finally{manager.stop();await rm(base,{recursive:true,force:true})}
})

test('turning off automatic indexing while building must retain paused status',async()=>{
  const base=await mkdtemp(join(tmpdir(),'dsh-gfy-pause-'))
  const watcher=fakeWatcher()
  let finish, entered
  const started=new Promise(resolve=>{entered=resolve})
  const pending=new Promise(resolve=>{finish=resolve})
  let mode='auto'
  const manager=createAutoGraphManager({
    run:async(_args,root)=>{
      await mkdir(join(root,'graphify-out'),{recursive:true})
      entered()
      await pending
      await writeFile(join(root,'graphify-out','graph.json'),'{"nodes":[{"id":"x"}],"links":[]}')
    },
    resolveProject:permitted(base),workspaceRoot:()=>base,watchImpl:watcher.watchImpl,
    getSettings:()=>({mode,scope:'sessions',allowlist:[],debounceSeconds:1,excludePatterns:[]})
  })
  try {
    await manager.attach(session('pause',base))
    await started
    mode='off'
    manager.refreshSettings()
    finish()
    await wait(100)
    const status=JSON.parse(await readFile(join(base,'graphify-out','.dsh-graphify-status.json'),'utf8'))
    assert.equal(status.state,'paused')
    assert.equal(manager.activeProjects(),0)
  }finally{finish?.();manager.stop();await rm(base,{recursive:true,force:true})}
})

test('rapid edits are coalesced and automatic reindex respects cooldown',async()=>{
  const base=await mkdtemp(join(tmpdir(),'dsh-gfy-cooldown-'))
  const watch=fakeWatcher(),calls=[]
  const manager=createAutoGraphManager({
    run:makeRunner(calls),resolveProject:permitted(base),workspaceRoot:()=>base,
    watchImpl:watch.watchImpl,debounceMs:25,minIntervalMs:260,
  })
  try {
    await mkdir(join(base,'src'))
    await writeFile(join(base,'src','app.ts'),'const a=1')
    await manager.attach(session('cool',base))
    await waitFor(()=>calls.length===1)
    await wait(50)
    watch.entries[0].emit('src/app.ts')
    watch.entries[0].emit('src/app.ts')
    watch.entries[0].emit('src/app.ts')
    await wait(85)
    assert.equal(calls.length,1,'no rebuild during cooldown, despite rapid duplicate events')
    await waitFor(()=>calls.length===2,1500)
    await wait(40)
    await writeFile(join(base,'src','app.ts'),'const a=2')
    watch.entries[0].emit('src/app.ts')
    await wait(75)
    assert.equal(calls.length,2,'changed content is queued for the following interval')
    await waitFor(()=>calls.length===3,1500)
  }finally{manager.stop();await rm(base,{recursive:true,force:true})}
})

test('updating Agent preference must not rebuild an already indexed graph',async()=>{
  const base=await mkdtemp(join(tmpdir(),'dsh-gfy-agent-only-'))
  const watch=fakeWatcher(),calls=[]
  let settings={mode:'auto',agentUsage:'smart',scope:'sessions',allowlist:[],
    debounceSeconds:20,minIntervalSeconds:180,excludePatterns:[]}
  const manager=createAutoGraphManager({
    run:makeRunner(calls),resolveProject:permitted(base),workspaceRoot:()=>base,
    watchImpl:watch.watchImpl,getSettings:()=>settings,debounceMs:20,minIntervalMs:0,
  })
  try {
    await manager.attach(session('agent',base))
    await waitFor(()=>calls.length===1)
    await wait(60)
    settings={...settings,agentUsage:'off',debounceSeconds:40,minIntervalSeconds:360}
    manager.refreshSettings()
    await wait(80)
    assert.equal(calls.length,1,'prompt and timing configuration must not retrigger scanning')
    assert.equal(manager.activeProjects(),1)
    assert.equal(watch.entries.length,1)
  }finally{manager.stop();await rm(base,{recursive:true,force:true})}
})

test('recent completed graph skips rebuild after quickly reopening session',async()=>{
  const base=await mkdtemp(join(tmpdir(),'dsh-gfy-reopen-'))
  const watch=fakeWatcher(),calls=[]
  const manager=createAutoGraphManager({
    run:makeRunner(calls),resolveProject:permitted(base),workspaceRoot:()=>base,
    watchImpl:watch.watchImpl,debounceMs:30,minIntervalMs:180000,
  })
  try {
    await manager.attach(session('one',base))
    await waitFor(()=>calls.length===1)
    await wait(65)
    manager.detach(session('one',base))
    await manager.attach(session('two',base))
    await wait(80)
    assert.equal(calls.length,1,'opening an already-fresh graph should not scan it again')
  }finally{manager.stop();await rm(base,{recursive:true,force:true})}
})


test('manual Graphify build in manual mode serializes concurrent calls and honors exclusions',async()=>{
  const base=await mkdtemp(join(tmpdir(),'dsh-gfy-manual-'))
  let count=0, finish
  const release=new Promise(resolve=>{finish=resolve})
  const manager=createAutoGraphManager({
    run:async(args,root)=>{
      if(isHtmlExport(args)){
        await mkdir(join(root,'graphify-out'),{recursive:true})
        await writeFile(join(root,'graphify-out','graph.html'),'<html></html>')
        return 'html'
      }
      count++
      assert.deepEqual(args.slice(0,3),['extract','.','--code-only'])
      assert.ok(args.includes('secrets/'))
      assert.ok(args.includes('--force'))
      await release
      await mkdir(join(root,'graphify-out'),{recursive:true})
      await writeFile(join(root,'graphify-out','graph.json'),'{"nodes":[],"links":[]}')
      return 'manual scan succeeded'
    },
    resolveProject:permitted(base),workspaceRoot:()=>base,
    getSettings:()=>({mode:'manual',scope:'sessions',excludePatterns:['secrets/'],debounceSeconds:20,minIntervalSeconds:180}),
  })
  try{
    const first=manager.rebuild(base,{full:true})
    const second=manager.rebuild(base,{full:true})
    finish()
    const results=await Promise.all([first,second])
    assert.deepEqual(results,['manual scan succeeded','manual scan succeeded'])
    assert.equal(count,1,'simultaneous Agent builds must not duplicate the scan')
    const status=JSON.parse(await readFile(join(base,'graphify-out','.dsh-graphify-status.json'),'utf8'))
    assert.equal(status.state,'ready')
    assert.equal(status.htmlAvailable,true)
    assert.equal(status.watching,false)
  }finally{finish?.();manager.stop();await rm(base,{recursive:true,force:true})}
})

test('Agent build joins an in-flight automatic graph scan without duplicate refresh',async()=>{
  const base=await mkdtemp(join(tmpdir(),'dsh-gfy-join-'))
  let entered,release
  const start=new Promise(resolve=>{entered=resolve})
  const blocker=new Promise(resolve=>{release=resolve})
  let scans=0
  const manager=createAutoGraphManager({
    run:async(args,root)=>{
      if(isHtmlExport(args)){
        await mkdir(join(root,'graphify-out'),{recursive:true})
        await writeFile(join(root,'graphify-out','graph.html'),'<html></html>')
        return 'html'
      }
      scans++
      entered()
      await blocker
      await mkdir(join(root,'graphify-out'),{recursive:true})
      await writeFile(join(root,'graphify-out','graph.json'),'{"nodes":[],"links":[]}')
      return 'shared scan completed'
    },
    resolveProject:permitted(base),workspaceRoot:()=>base,
    watchImpl:fakeWatcher().watchImpl,debounceMs:25,
  })
  try{
    await manager.attach(session('joined',base))
    await start
    const manual=manager.rebuild(base)
    release()
    assert.equal(await manual,'shared scan completed')
    await wait(80)
    assert.equal(scans,1,'joining an automatic scan must not schedule another scan')
  }finally{release?.();manager.stop();await rm(base,{recursive:true,force:true})}
})

test('full Agent rebuild during an automatic scan runs a forced scan afterwards',async()=>{
  const base=await mkdtemp(join(tmpdir(),'dsh-gfy-full-join-'))
  let entered,release
  const start=new Promise(resolve=>{entered=resolve})
  const blocker=new Promise(resolve=>{release=resolve})
  const scans=[]
  const manager=createAutoGraphManager({
    run:async(args,root)=>{
      if(isHtmlExport(args)){
        await mkdir(join(root,'graphify-out'),{recursive:true})
        await writeFile(join(root,'graphify-out','graph.html'),'<html></html>')
        return 'html'
      }
      scans.push([...args])
      if(scans.length===1){entered();await blocker}
      await mkdir(join(root,'graphify-out'),{recursive:true})
      await writeFile(join(root,'graphify-out','graph.json'),'{"nodes":[],"links":[]}')
      return 'scan complete'
    },
    resolveProject:permitted(base),workspaceRoot:()=>base,
    watchImpl:fakeWatcher().watchImpl,debounceMs:25,
  })
  try{
    await manager.attach(session('full-join',base))
    await start
    const manual=manager.rebuild(base,{full:true})
    release()
    assert.equal(await manual,'scan complete')
    assert.equal(scans.length,2,'a full request must not reuse an incremental scan')
    assert.equal(scans[0].includes('--force'),false)
    assert.equal(scans[1].includes('--force'),true)
  }finally{release?.();manager.stop();await rm(base,{recursive:true,force:true})}
})

test('manual Graphify scan propagates failures instead of reporting false success',async()=>{
  const base=await mkdtemp(join(tmpdir(),'dsh-gfy-failed-manual-'))
  const manager=createAutoGraphManager({
    run:async()=>{throw Error('offline Graphify engine')},
    resolveProject:permitted(base),workspaceRoot:()=>base,
    getSettings:()=>({mode:'off',scope:'sessions',excludePatterns:[],debounceSeconds:20,minIntervalSeconds:180}),
  })
  try{
    await assert.rejects(manager.rebuild(base),/offline Graphify engine/)
    await waitFor(()=>existsSync(join(base,'graphify-out','.dsh-graphify-status.json')))
    const status=JSON.parse(await readFile(join(base,'graphify-out','.dsh-graphify-status.json'),'utf8'))
    assert.equal(status.state,'error')
  }finally{manager.stop();await rm(base,{recursive:true,force:true})}
})

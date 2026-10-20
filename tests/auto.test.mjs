import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, relative, resolve, isAbsolute } from 'node:path'
import { tmpdir } from 'node:os'
import { classifyChange, createAutoGraphManager } from '../src/auto.js'

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
function makeRunner(calls) {
  return async (args, root) => {
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
    assert.deepEqual(calls[0], ['extract', '.', '--code-only'])
    await waitFor(() => manager.activeProjects() === 1)
    await wait(50)
    const first = JSON.parse(await readFile(join(base, 'graphify-out', '.dsh-graphify-status.json'), 'utf8'))
    assert.equal(first.state, 'ready')
    assert.equal(first.watching, true)
    watch.entries[0].emit('src/a.ts')
    watch.entries[0].emit('src/b.ts')
    watch.entries[0].emit('src/c.ts')
    await waitFor(() => calls.length === 2)
    assert.deepEqual(calls[1], ['update'])
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

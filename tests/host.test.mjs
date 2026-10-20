import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mkdtemp, mkdir, symlink, rm, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = readFileSync(join(root, 'src/index.js'), 'utf8')
const stub = source.replace("import { defineTool } from '@deepseek-ai/dsh-tools'", 'const defineTool = x => x')
  .replace("import { runGraphify } from './runtime.js'", "const runGraphify = async () => 'mock Graphify'")
  .replace("export { runGraphify } from './runtime.js'", 'export { runGraphify }')
  .replace("import { createAutoGraphManager } from './auto.js'", "const createAutoGraphManager = () => ({ attach: async () => {}, detach: () => {}, stop: () => {} })")
const host = await import('data:text/javascript,' + encodeURIComponent(stub))
test('Host plugin exports two native DSH Agent tools', () => {
  const list = []
  const ctx = { sandboxPolicy: { workspaceRoot: tmpdir() }, tools: { register: x => list.push(x) } }
  host.apply(ctx)
  assert.deepEqual(list.map(x => x.name), ['graphify_build', 'graphify_query'])
  assert.ok(list[0].parameters.directory)
})
test('Native DSH tool schemas use required:true only for required arguments', async () => {
  const tools = []
  const ctx = { sandboxPolicy: { workspaceRoot: tmpdir() }, tools: { register: tool => tools.push(tool) } }
  host.apply(ctx)
  for (const tool of tools) {
    for (const [key, property] of Object.entries(tool.parameters)) {
      assert.ok(!Object.hasOwn(property, 'required') || property.required === true,
        `${tool.name}.${key}: optional arguments must omit required rather than use false`)
    }
  }
  const build = tools.find(tool => tool.name === 'graphify_build')
  const query = tools.find(tool => tool.name === 'graphify_query')
  assert.equal(Object.hasOwn(build.parameters.directory, 'required'), false)
  assert.equal(Object.hasOwn(build.parameters.update, 'required'), false)
  assert.equal(Object.hasOwn(query.parameters.directory, 'required'), false)
  assert.equal(query.parameters.question.required, true)
  const result = await build.execute({})
  assert.match(result, /mock Graphify/)
  assert.equal(await query.execute({ question: 'Show module dependencies' }), 'mock Graphify')
})

test('DSH session policy root, not Host fallback, selects project directory', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'dsh-gfy-session-'))
  const project = join(temp, 'project')
  await mkdir(project)
  try {
    const tools = []
    const listeners = new Map()
    const ctx = {
      sandboxPolicy: {
        workspaceRoot: join(temp, 'host-fallback'),
        resolve: ({ session }) => ({ workspaceRoot: session?.header?.cwd || temp }),
      },
      tools: { register: t => tools.push(t) },
      on: (name, callback) => listeners.set(name, callback),
      effect: callback => callback(),
    }
    host.apply(ctx)
    assert.ok(listeners.has('session/created'))
    assert.ok(listeners.has('session/disposed'))
    const result = await tools[0].execute({}, { agent: { session: { header: { cwd: project } } } })
    assert.match(result, /Graphify project:/)
    assert.ok(result.includes(await realpath(project)))
  } finally { await rm(temp, { recursive: true, force: true }) }
})

test('Workspace path validator blocks .. and symbolic-link escapes', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'dsh-graphify-'))
  const base = join(temp, 'base'), inside = join(base, 'inside'), outside = join(temp, 'outside')
  try {
    await mkdir(inside, { recursive: true })
    await mkdir(outside)
    assert.equal(await host.projectDirectory(base, 'inside'), await realpath(inside))
    assert.equal(await host.projectDirectory(base), await realpath(base))
    await assert.rejects(host.projectDirectory(base, '../outside'), /outside/)
    if (process.platform !== 'win32') {
      await symlink(outside, join(base, 'escape'))
      await assert.rejects(host.projectDirectory(base, 'escape'), /outside/)
    }
  } finally { await rm(temp, { recursive: true, force: true }) }
})

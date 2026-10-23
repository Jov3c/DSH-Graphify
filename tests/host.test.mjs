import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mkdtemp, mkdir, symlink, rm, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = readFileSync(join(root, 'src/index.js'), 'utf8')
const stub = source.replace("import { defineTool } from '@deepseek-ai/dsh-tools'", 'const defineTool = x => x')
  .replace("import { runGraphify, installGraphifyExtras } from './runtime.js'", "const graphifyCalls=[]; const runGraphify = async (...args) => { graphifyCalls.push(args); return 'mock Graphify' }; const installGraphifyExtras = async () => 'mock extras'")
  .replace("export { runGraphify } from './runtime.js'", 'export { runGraphify, graphifyCalls }')
  .replace("import { createAutoGraphManager } from './auto.js'", "const createAutoGraphManager = () => ({ attach: async () => {}, detach: () => {}, stop: () => {}, rebuild: async (cwd, options={}) => { graphifyCalls.push(['rebuild-options', options]); return runGraphify(['extract', '.', '--code-only'], cwd, {timeoutMs: 600000}) } })")
  .replace("import { readSettings } from './settings.js'", "const readSettings = () => ({mode: 'auto', agentUsage:'smart', scope: 'sessions',allowlist:[],debounceSeconds:3,excludePatterns:[]})")
  .replace("import { graphifyAgentGuidance } from './agent-guidance.js'", "const graphifyAgentGuidance = context => 'Graphify assistant guidance for '+context.session.id")
  .replace("import { readImpactContext } from './impact-context.js'", "const readImpactContext = async () => 'Supplemental code graph audit test'")
  .replace("import { extraToolDescriptors } from './capabilities.js'", "const extraToolDescriptors = () => []")
  .replace("export { Config } from './settings.js'", "export const Config = {}")
const host = await import('data:text/javascript,' + encodeURIComponent(stub))
const guidanceSections=[]
const systemPrompt={section: x => { guidanceSections.push(x); return () => {} }}
test('Host plugin exports five original Graphify DSH Agent tools', () => {
  const list = []
  const ctx = { sandboxPolicy: { workspaceRoot: tmpdir() }, systemPrompt,effect: callback => callback(),tools: { register: x => list.push(x) } }
  host.apply(ctx)
  assert.deepEqual(list.map(x => x.name), ['graphify_build', 'graphify_query', 'graphify_path', 'graphify_explain', 'graphify_affected'])
  assert.ok(list[0].parameters.directory)
  assert.ok(guidanceSections.some(x=>x.name==='tool:graphify-project-intelligence'))
})
test('Native DSH tool schemas use required:true only for required arguments', async () => {
  const tools = []
  const ctx = { sandboxPolicy: { workspaceRoot: tmpdir() }, systemPrompt,effect: callback => callback(),tools: { register: tool => tools.push(tool) } }
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
  assert.equal(Object.hasOwn(build.parameters.full, 'required'), false)
  assert.equal(Object.hasOwn(query.parameters.directory, 'required'), false)
  assert.equal(query.parameters.question.required, true)
  const root = await mkdtemp(join(tmpdir(), 'graphify-host-tools-'))
  try {
    const list=[]
    const ctx={sandboxPolicy:{workspaceRoot:root},systemPrompt,effect:callback=>callback(),tools:{register:x=>list.push(x)}}
    host.apply(ctx)
    const build = list.find(tool=>tool.name==='graphify_build')
    const query = list.find(tool=>tool.name==='graphify_query')
    const path = list.find(tool=>tool.name==='graphify_path')
    const explain = list.find(tool=>tool.name==='graphify_explain')
    const affected = list.find(tool=>tool.name==='graphify_affected')
    const answer = await build.execute({})
    assert.match(answer,/mock Graphify/)
    assert.deepEqual(host.graphifyCalls.at(-1)[0].slice(0,3),['extract','.','--code-only'])
    const beforeFull = host.graphifyCalls.length
    await build.execute({full:true})
    const optionCall = host.graphifyCalls.slice(beforeFull).find(call => call[0] === 'rebuild-options')
    assert.deepEqual(optionCall[1], {full:true}, 'graphify_build must forward an explicit full rebuild')
    await assert.rejects(query.execute({question:'show code'}),/graphify_build/)
    await mkdir(join(root,'graphify-out'))
    await writeFile(join(root,'graphify-out','graph.json'),'{"nodes":[],"links":[]}')
    assert.equal(await query.execute({question:'show code'}),'mock Graphify')
    assert.deepEqual(host.graphifyCalls.at(-1)[0],['query','show code'])
    assert.equal(await path.execute({source:'Auth',target:'DB'}),'mock Graphify')
    assert.deepEqual(host.graphifyCalls.at(-1)[0],['path','Auth','DB'])
    assert.equal(await explain.execute({node:'Auth'}),'mock Graphify')
    assert.deepEqual(host.graphifyCalls.at(-1)[0],['explain','Auth'])
    assert.match(await affected.execute({node:'Auth',depth:3}),/^mock Graphify\n\nSupplemental code graph audit test/)
    assert.deepEqual(host.graphifyCalls.at(-1)[0],['affected','Auth','--depth','3'])
    await assert.rejects(affected.execute({node:'Auth',depth:99}),/1–5/)
    await assert.rejects(path.execute({source:'',target:'DB'}),/source must/)
    await assert.rejects(query.execute({question:' '}),/1–1000/)
  }finally{await rm(root,{recursive:true,force:true})}
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
      systemPrompt,
      tools: { register: t => tools.push(t) },
      sessions: { list: () => [] },
      on: (name, callback) => listeners.set(name, callback),
      effect: callback => callback(),
    }
    host.apply(ctx)
    assert.ok(listeners.has('session/created'))
    assert.ok(listeners.has('session/disposed'))
    const result = await tools[0].execute({}, { agent: { session: { header: { cwd: project } } } })
    assert.match(result, /Graphify code-only graph:/)
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

test('Graphify prompt guidance is dynamically scoped to the current Agent session', () => {
  const guide = guidanceSections.at(-1)
  assert.equal(guide.text({}), '')
  const result = guide.text({agent:{session:{id:'project-1',header:{cwd:tmpdir()}}}})
  assert.equal(result,'Graphify assistant guidance for project-1')
})

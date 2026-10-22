import { resolve, relative, isAbsolute } from 'node:path'
import { realpath, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { runGraphify, installGraphifyExtras } from './runtime.js'
import { createAutoGraphManager } from './auto.js'
import { readSettings } from './settings.js'
import { graphifyAgentGuidance } from './agent-guidance.js'
import { readImpactContext } from './impact-context.js'
import { extraToolDescriptors } from './capabilities.js'
export { Config } from './settings.js'
export { runGraphify } from './runtime.js'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'dsh-graphify'
export const inject = ['tools', 'sandboxPolicy', 'sessions', 'systemPrompt']

// No user-supplied shell string is ever executed. Scope is constrained to the
// composed sandbox policy's filesystem root (not the host process cwd).
export async function projectDirectory(policyRoot, requested = '') {
  const base = await realpath(policyRoot)
  const candidate = requested.trim() ? (isAbsolute(requested) ? requested : resolve(base, requested)) : base
  const target = await realpath(candidate)
  const relativePath = relative(base, target)
  if (relativePath === '..' || relativePath.startsWith('../') || relativePath.startsWith('..\\') || isAbsolute(relativePath)) {
    throw new Error('Project path is outside the DSH workspace policy root')
  }
  if (!(await stat(target)).isDirectory()) throw new Error('Project path is not a directory')
  return target
}


function output() {
  return { schema: { type: 'string' }, render: (_args, result) => [{ type: 'text', text: result }] }
}

export function apply(ctx, configuration) {
  const workspace = session => ctx.sandboxPolicy.resolve?.({ session }).workspaceRoot ?? ctx.sandboxPolicy.workspaceRoot
  const auto = createAutoGraphManager({
    run: runGraphify,
    resolveProject: projectDirectory,
    workspaceRoot: workspace,
    getSettings: () => readSettings(configuration),
    log: message => ctx.logger?.warn?.(message),
  })
  // Dynamic, project-scoped guidance: the user may ask naturally without ever
  // naming Graphify tool identifiers. The model chooses; no forced tool calls
  // or source-code/AGENTS.md mutations occur.
  ctx.effect(() => ctx.systemPrompt.section({
    name: 'tool:graphify-project-intelligence',
    order: 210,
    interpolate: false,
    text: context => {
      const session = context.agent?.session
      if (!session) return ''
      let allowedRoot
      try { allowedRoot = workspace(session) } catch { return '' }
      return graphifyAgentGuidance({
        session,
        policyRoot: allowedRoot,
        settings: readSettings(configuration),
      })
    },
  }), 'dsh-graphify:agent-prompt')

  // DSH Session events supply the actual project cwd. Nothing is scanned or
  // downloaded until an authorized local project session becomes active.
  if (process.env.DSH_GRAPHIFY_AUTO !== '0' && typeof ctx.on === 'function') {
    ctx.on('session/created', session => { void auto.attach(session) })
    ctx.on('session/disposed', session => { auto.detach(session) })
    ctx.on('loader/volatile-update', () => { auto.refreshSettings() })
    // Plugin activation may happen after the Desktop has already restored its
    // blank project Session. Catch up on live Sessions, including that one.
    for (const session of ctx.sessions.list()) void auto.attach(session)
    ctx.effect?.(() => () => auto.stop())
  }
  // Official open-source Graphify operations are exposed as narrow, typed
  // native tools, never as a raw shell/argv passthrough.
  for(const descriptor of extraToolDescriptors({
    project: async(args,exec)=>projectDirectory(workspace(exec?.agent?.session),args.directory||''),
    run: runGraphify,
    installExtras:installGraphifyExtras,
    settings:()=>readSettings(configuration),
  }))ctx.tools.register(defineTool(descriptor))

  // Basic graph analysis is explicitly local and code-only. Semantic extraction
  // must remain a separate user-authorized future feature.
  ctx.tools.register(defineTool({
    name: 'graphify_build',
    description: 'Create or incrementally refresh the local CODE graph for the active DSH project. Executes official Graphify extract --code-only; never calls an LLM or uploads project files. Use when missing or stale.',
    parameters: {
      directory: { type: 'string', description: 'Optional project directory inside current DSH workspace.' },
      update: { type: 'boolean', description: 'When true, reuse incremental graph extraction (the code-only extractor also incrementally updates by default).' },
    },
    output: output(),
    async execute(args, exec) {
      const cwd = await projectDirectory(workspace(exec?.agent?.session), args.directory || '')
      // Reuse the session manager, not a second independent extractor:
      // concurrent Agent requests and automatic scans must share one build.
      const result = await auto.rebuild(cwd)
      return 'Graphify code-only graph: ' + cwd + '\n' + result
    },
  }))
  async function existingGraph(args, exec) {
    const cwd = await projectDirectory(workspace(exec?.agent?.session), args.directory || '')
    if (!existsSync(join(cwd, 'graphify-out', 'graph.json'))) {
      throw new Error('No Graphify graph in this project. Run graphify_build first.')
    }
    return cwd
  }
  function requireLabel(value, name) {
    const label = String(value || '').trim()
    if (!label || label.length > 200) throw new Error(name + ' must be 1–200 characters')
    return label
  }
  ctx.tools.register(defineTool({
    name: 'graphify_query',
    description: 'FIRST choice for natural-language project architecture, files, module dependency and code organization questions, before expensive broad source searches. Use existing graph; then verify source when needed. Do not call for unrelated conversation.',
    parameters: {
      question: { type: 'string', required: true, description: 'Codebase question, 1–1000 characters.' },
      directory: { type: 'string', description: 'Optional local project directory inside current DSH workspace.' },
    },
    output: output(),
    async execute(args, exec) {
      const question = String(args.question || '').trim()
      if (!question || question.length > 1000) throw new Error('question must be 1–1000 characters')
      const cwd = await existingGraph(args, exec)
      return await runGraphify(['query', question], cwd, { timeoutMs: 45_000 })
    },
  }))
  ctx.tools.register(defineTool({
    name: 'graphify_path',
    description: 'Use for natural-language questions about how two project functions, modules or services communicate or depend on each other; returns the Graphify static relationship path.',
    parameters: {
      source: { type: 'string', required: true, description: 'Start node name.' },
      target: { type: 'string', required: true, description: 'End node name.' },
      directory: { type: 'string', description: 'Optional local project directory inside current DSH workspace.' },
    },
    output: output(),
    async execute(args, exec) {
      const source = requireLabel(args.source, 'source')
      const target = requireLabel(args.target, 'target')
      const cwd = await existingGraph(args, exec)
      return await runGraphify(['path', source, target], cwd, { timeoutMs: 45_000 })
    },
  }))
  ctx.tools.register(defineTool({
    name: 'graphify_explain',
    description: 'Use for natural-language questions about what one project module, function or class does and how it connects. Looks up its indexed Graphify neighbors; verify source before editing.',
    parameters: {
      node: { type: 'string', required: true, description: 'Graph node or code symbol name.' },
      directory: { type: 'string', description: 'Optional local project directory inside current DSH workspace.' },
    },
    output: output(),
    async execute(args, exec) {
      const node = requireLabel(args.node, 'node')
      const cwd = await existingGraph(args, exec)
      return await runGraphify(['explain', node], cwd, { timeoutMs: 45_000 })
    },
  }))
  ctx.tools.register(defineTool({
    name: 'graphify_affected',
    description: 'Use this FIRST for natural-language requests about what modifying a project module, class, function, login flow, API, or data model might break. Runs original Graphify reverse dependency analysis and supplies contextual co-import candidates, tests and completeness warnings. Never claim dynamic/runtime dependencies are covered without checking actual source.',
    parameters: {
      node: { type: 'string', required: true, description: 'Node to analyze.' },
      depth: { type: 'integer', description: 'Relationship depth 1–5, default 2.' },
      directory: { type: 'string', description: 'Optional local project directory inside current DSH workspace.' },
    },
    output: output(),
    async execute(args, exec) {
      const node = requireLabel(args.node, 'node')
      const depth = args.depth === undefined ? 2 : args.depth
      if (!Number.isInteger(depth) || depth < 1 || depth > 5) throw new Error('depth must be an integer 1–5')
      const cwd = await existingGraph(args, exec)
      const original=await runGraphify(['affected', node, '--depth', String(depth)], cwd, { timeoutMs: 45_000 })
      let context
      try {
        context=await readImpactContext(cwd,node)
      } catch (error) {
        context='Supplemental graph audit unavailable: ' + (error instanceof Error ? error.message : String(error))
      }
      return original + '\n\n' + context
    },
  }))
}

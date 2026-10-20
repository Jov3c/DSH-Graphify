import { resolve, relative, isAbsolute } from 'node:path'
import { realpath, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { runGraphify } from './runtime.js'
import { createAutoGraphManager } from './auto.js'
import { readSettings } from './settings.js'
import { graphifyAgentGuidance } from './agent-guidance.js'
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
      const options = readSettings(configuration)
      const parameters = ['extract', '.', '--code-only']
      for (const pattern of options.excludePatterns) parameters.push('--exclude', pattern)
      const result = await runGraphify(parameters, cwd, { timeoutMs: 600_000 })
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
    description: 'Prefer this for scoped questions about the active project codebase, modules and dependencies before broad file searches. Queries the existing local Graphify graph; confirm important results against source code.',
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
    description: 'Find the original Graphify shortest relationship path between two named code symbols or modules; use when asked how A relates to B.',
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
    description: 'Explain an indexed code symbol, its source location, community and relationships using official Graphify; useful before editing unfamiliar code.',
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
    description: 'Analyze potential code change blast radius for a symbol or module before editing; validate important dependencies against current source code.',
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
      return await runGraphify(['affected', node, '--depth', String(depth)], cwd, { timeoutMs: 45_000 })
    },
  }))
}

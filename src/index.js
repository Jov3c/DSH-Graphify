import { resolve, relative, isAbsolute } from 'node:path'
import { realpath, stat } from 'node:fs/promises'
import { runGraphify } from './runtime.js'
export { runGraphify } from './runtime.js'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'dsh-graphify'
export const inject = ['tools', 'sandboxPolicy']

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

export function apply(ctx) {
  const workspace = () => ctx.sandboxPolicy.workspaceRoot
  ctx.tools.register(defineTool({
    name: 'graphify_build',
    description: 'Build or update a Graphify knowledge graph in a permitted local project directory. First run downloads a verified isolated uv/Python/Graphify engine into plugin-managed cache; no separate user installation required. No shell command injection. After completion tell user to open/refresh the Graphify right sidebar tab.',
    parameters: {
      directory: { type: 'string', description: 'Relative project directory under current DSH workspace root, or an absolute directory inside it. Defaults to policy workspace root.' },
      update: { type: 'boolean', description: 'If true, use graphify update instead of a full rebuild.' },
    },
    output: output(),
    async execute(args) {
      const cwd = await projectDirectory(workspace(), args.directory || '')
      const result = await runGraphify(args.update ? ['update'] : ['.'], cwd, { timeoutMs: 180_000 })
      return `Graphify project: ${cwd}\n${result}`
    },
  }))
  ctx.tools.register(defineTool({
    name: 'graphify_query',
    description: 'Query an existing local Graphify graph for code dependencies or concepts. Build the graph first if missing.',
    parameters: {
      question: { type: 'string', required: true, description: 'Question about the indexed project.' },
      directory: { type: 'string', description: 'Project directory inside current DSH workspace root.' },
    },
    output: output(),
    async execute(args) {
      if (!String(args.question || '').trim()) throw new Error('A non-empty question is required')
      if (String(args.question).length > 1000) throw new Error('Question too long (max 1000 characters)')
      const cwd = await projectDirectory(workspace(), args.directory || '')
      return await runGraphify(['query', args.question], cwd, { timeoutMs: 45_000 })
    },
  }))
}

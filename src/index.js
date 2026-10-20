import { resolve, relative, isAbsolute } from 'node:path'
import { realpath, stat } from 'node:fs/promises'
import { spawn } from 'node:child_process'
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

export function runGraphify(args, cwd, { timeoutMs = 120_000, maxOutput = 8_192 } = {}) {
  return new Promise((resolvePromise, reject) => {
    const executable = process.env.DSH_GRAPHIFY_BIN || 'graphify'
    const child = spawn(executable, args, { cwd, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let timedOut = false
    const collect = chunk => { out = (out + String(chunk)).slice(-maxOutput) }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)
    const timer = setTimeout(() => { timedOut = true; child.kill() }, timeoutMs)
    child.on('error', error => { clearTimeout(timer); reject(new Error(`Unable to start Graphify: ${error.message}`)) })
    child.on('close', code => {
      clearTimeout(timer)
      if (timedOut) return reject(new Error(`Graphify exceeded ${timeoutMs} ms`))
      if (code !== 0) return reject(new Error(`Graphify exited ${code}: ${out.trim()}`))
      resolvePromise(out.trim() || 'Graphify completed. Refresh the Graphify tab to view the result.')
    })
  })
}

function output() {
  return { schema: { type: 'string' }, render: (_args, result) => [{ type: 'text', text: result }] }
}

export function apply(ctx) {
  const workspace = () => ctx.sandboxPolicy.workspaceRoot
  ctx.tools.register(defineTool({
    name: 'graphify_build',
    description: 'Explicitly build or update a Graphify knowledge graph in a permitted local project directory. No shell command injection. After completion tell user to open/refresh the Graphify right sidebar tab.',
    parameters: {
      directory: { type: 'string', required: false, description: 'Relative project directory under current DSH workspace root, or an absolute directory inside it. Defaults to policy workspace root.' },
      update: { type: 'boolean', required: false, description: 'If true, use graphify update instead of a full rebuild.' },
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
      directory: { type: 'string', required: false, description: 'Project directory inside current DSH workspace root.' },
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

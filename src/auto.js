/**
 * DSH Desktop project lifecycle -> local, code-only Graphify background index.
 * Runs on session creation, not on an Agent prompt or a UI click.
 * Scoped to a real project within the existing DSH sandbox policy root.
 */
import { watch as watchFs, existsSync } from 'node:fs'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { join, extname, basename } from 'node:path'

export const STATUS_NAME = '.dsh-graphify-status.json'
export const AUTO_DEBOUNCE_MS = 3000
const IGNORE = new Set(['.git', '.hg', '.svn', 'node_modules', '.venv', 'venv', '.next', '.nuxt', '.turbo', 'coverage', 'dist', 'build', 'target', '__pycache__', 'graphify-out'])
const CODE_EXTENSIONS = new Set([
  '.py', '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts',
  '.go', '.rs', '.java', '.kt', '.kts', '.scala', '.cs', '.c', '.h', '.cc',
  '.cpp', '.hpp', '.rb', '.php', '.swift', '.lua', '.sh', '.bash', '.ps1',
  '.ex', '.exs', '.jl', '.zig', '.groovy', '.sql', '.dart', '.vue', '.svelte',
  '.html', '.css', '.scss', '.json', '.toml', '.yaml', '.yml',
])
const DOC_EXTENSIONS = new Set(['.md', '.mdx', '.rst', '.pdf', '.docx', '.txt', '.png', '.jpg', '.jpeg'])
const now = () => new Date().toISOString()

/** Pure path classification (no document/LLM extraction is triggered). */
export function classifyChange(filename) {
  if (filename === undefined || filename === null) return 'code'
  const name = String(filename).replaceAll('\\', '/')
  const parts = name.split('/').filter(Boolean)
  if (!parts.length || parts.some(part => IGNORE.has(part))) return 'ignore'
  const leaf = parts.at(-1)
  if (leaf.startsWith('.') && leaf !== '.graphifyrc') return 'ignore'
  if (leaf === 'pnpm-lock.yaml' || leaf === 'package-lock.json' || leaf === 'yarn.lock') return 'ignore'
  if (leaf === '.graphifyrc') return 'code'
  const ext = extname(leaf).toLowerCase()
  if (CODE_EXTENSIONS.has(ext)) return 'code'
  if (DOC_EXTENSIONS.has(ext)) return 'document'
  // An FS watcher may report a newly-created directory rather than its children.
  return !ext ? 'code' : 'ignore'
}

async function writeStatus(root, state, detail = '', extras = {}) {
  const folder = join(root, 'graphify-out')
  await mkdir(folder, { recursive: true })
  const path = join(folder, STATUS_NAME)
  const payload = { version: 1, state, detail: String(detail).slice(0, 700), updatedAt: now(), ...extras }
  // The file is small; the workspace-file remote can read it directly.
  await writeFile(path, JSON.stringify(payload) + '\n', { encoding: 'utf8' })
}
export function createAutoGraphManager({
  run, resolveProject, workspaceRoot, watchImpl = watchFs,
  debounceMs = AUTO_DEBOUNCE_MS, log = () => {},
}) {
  const sessions = new Map()
  const projects = new Map()
  let disposed = false

  const graphFile = root => join(root, 'graphify-out', 'graph.json')
  function reportFailure(project, error) {
    const detail = error instanceof Error ? error.message : String(error)
    void writeStatus(project.root, 'error', detail).catch(err => log('status write error: ' + err))
    log('Graphify background update: ' + detail)
  }
  function startWatcher(project) {
    try {
      project.watcher = watchImpl(project.root, { recursive: true }, (_event, filename) => {
        if (project.closed) return
        const kind = classifyChange(filename)
        if (kind === 'ignore') return
        if (kind === 'document') {
          project.documentsStale = true
          if (!project.running) {
            void writeStatus(project.root, 'ready', 'Documents/media changed. Code graph remains usable; semantic re-extraction is manual.', { documentsStale: true })
              .catch(error => log(String(error)))
          }
          return
        }
        project.dirty = true
        clearTimeout(project.timer)
        project.timer = setTimeout(() => { project.timer = undefined; void build(project) }, debounceMs)
      })
      project.watcher.on?.('error', err => {
        project.watcher?.close()
        project.watcher = undefined
        log('Graphify file watch unavailable: ' + String(err))
        void writeStatus(project.root, 'ready', 'File watching unavailable; reopen the project or use graphify_build to update.', { watching: false }).catch(() => {})
      })
    } catch (error) {
      log('Graphify file watch unavailable: ' + String(error))
      // Build still works on filesystems without recursive watch support.
    }
  }

  async function build(project, { force = false } = {}) {
    if (project.closed || disposed) return
    if (project.running) {
      project.dirty = true
      return project.running
    }
    clearTimeout(project.timer)
    project.timer = undefined
    const full = force || !existsSync(graphFile(project.root))
    project.dirty = false
    project.running = (async () => {
      try {
        await writeStatus(project.root, full ? 'building' : 'updating',
          full ? 'Preparing local engine and indexing code (no AI or token use)' : 'Refreshing changed code',
          { watching: !!project.watcher, documentsStale: project.documentsStale })
        const args = full ? ['extract', '.', '--code-only'] : ['update']
        await run(args, project.root, { timeoutMs: 600_000 })
        if (!existsSync(graphFile(project.root))) throw new Error('Graphify completed but graphify-out/graph.json is missing')
        await writeStatus(project.root, 'ready',
          project.documentsStale ? 'Code graph ready. Documents/media require separate semantic refresh.' : 'Graph up to date',
          { watching: !!project.watcher, documentsStale: project.documentsStale })
      } catch (error) { reportFailure(project, error) }
      finally {
        project.running = undefined
        if (project.dirty && !project.closed && !disposed) {
          project.timer = setTimeout(() => { project.timer = undefined; void build(project) }, debounceMs)
        }
      }
    })()
    return project.running
  }

  async function attach(session) {
    const id = session?.id
    const cwd = session?.header?.cwd
    if (disposed || typeof id !== 'string' || typeof cwd !== 'string' || sessions.has(id)) return
    const token = { root: undefined }
    sessions.set(id, token)
    try {
      const root = await resolveProject(workspaceRoot(), cwd)
      if (disposed || sessions.get(id) !== token) return
      let project = projects.get(root)
      if (!project) {
        project = { root, sessionIds: new Set(), watcher: undefined, timer: undefined, running: undefined, dirty: false, closed: false, documentsStale: false }
        projects.set(root, project)
        startWatcher(project)
        // Every session activation checks the graph, but existing graphs are
        // refreshed incrementally rather than rebuilt from scratch.
        void build(project)
      }
      project.sessionIds.add(id)
      token.root = root
    } catch (error) {
      sessions.delete(id)
      log('Graphify skipped session (no permitted local project): ' + String(error))
    }
  }

  function detach(session) {
    const id = session?.id
    const token = sessions.get(id)
    if (!token) return
    sessions.delete(id)
    if (!token.root) return
    const project = projects.get(token.root)
    if (!project) return
    project.sessionIds.delete(id)
    if (project.sessionIds.size === 0) {
      project.closed = true
      clearTimeout(project.timer)
      project.watcher?.close()
      projects.delete(token.root)
    }
  }

  /** Agent-triggered build reuses the same serialized per-project queue. */
  async function rebuild(root) {
    const project = projects.get(root)
    if (project) return build(project, { force: true })
    return run(['extract', '.', '--code-only'], root, { timeoutMs: 600_000 })
  }

  function stop() {
    disposed = true
    for (const project of projects.values()) {
      project.closed = true
      clearTimeout(project.timer)
      project.watcher?.close()
    }
    projects.clear()
    sessions.clear()
  }

  return { attach, detach, rebuild, stop, activeProjects: () => projects.size }
}

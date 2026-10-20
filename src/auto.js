/**
 * DSH Desktop project lifecycle -> local, code-only Graphify background index.
 * Runs on session creation, not on an Agent prompt or a UI click.
 * Scoped to a real project within the existing DSH sandbox policy root.
 */
import { watch as watchFs, existsSync } from 'node:fs'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { join, extname, relative, isAbsolute, resolve } from 'node:path'
import { DEFAULT_SETTINGS } from './defaults.js'

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
/** Watcher exclusions; the scanner separately receives --exclude flags. */
export function excluded(filename, rules=[]) {
  const path=String(filename ?? '').replaceAll('\\','/').replace(/^\.\/+/,'')
  const segments=path.split('/')
  for(const raw of rules) {
    if(typeof raw!=='string'||!raw||raw.startsWith('!'))continue
    const pattern=raw.replaceAll('\\','/').replace(/^\.\//,'')
    const directory=pattern.endsWith('/')
    const clean=directory?pattern.slice(0,-1):pattern
    if(!clean||clean.includes('..'))continue
    const escaped=clean.replace(/[.+^$(){}|[\]\\]/g,'\\$&').replace(/\*\*/g,'@@GLOBSTAR@@').replace(/\*/g,'[^/]*').replace(/\?/g,'[^/]').replace(/@@GLOBSTAR@@/g,'.*')
    let test
    try{test=new RegExp('^'+escaped+'$','i')}catch{continue}
    if(directory ? segments.slice(0,-1).some(x=>test.test(x)) : segments.some(x=>test.test(x)) || test.test(path))return true
  }
  return false
}
export function allowedProject(root,config) {
  if(config.scope!=='allowlist')return true
  return config.allowlist.some(path=>typeof path==='string'&&isAbsolute(path)&&resolve(path).toLowerCase()===resolve(root).toLowerCase())
}
export function classifyChange(filename, excludePatterns=[]) {
  if (filename === undefined || filename === null) return 'code'
  const name = String(filename).replaceAll('\\', '/')
  if(excluded(name,excludePatterns))return 'ignore'
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
  debounceMs = undefined, getSettings = () => DEFAULT_SETTINGS, log = () => {},
}) {
  const sessions = new Map()
  const projects = new Map()
  let disposed = false
  const config=()=>({...DEFAULT_SETTINGS,...getSettings()})
  const effectiveDelay=()=>debounceMs ?? config().debounceSeconds*1000

  const graphFile = root => join(root, 'graphify-out', 'graph.json')
  function reportFailure(project, error) {
    const detail = error instanceof Error ? error.message : String(error)
    void writeStatus(project.root, 'error', detail).catch(err => log('status write error: ' + err))
    log('Graphify background update: ' + detail)
  }
  function startWatcher(project) {
    if(config().mode!=='auto')return
    try {
      project.watcher = watchImpl(project.root, { recursive: true }, (_event, filename) => {
        if (project.closed) return
        if(config().mode!=='auto')return
        const kind = classifyChange(filename,config().excludePatterns)
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
        project.timer = setTimeout(() => { project.timer = undefined; void build(project) }, effectiveDelay())
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
    if (project.closed || disposed || (!force && !['auto','open'].includes(config().mode))) return
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
        const args = ['extract', '.', '--code-only']
        for(const pattern of config().excludePatterns)args.push('--exclude',pattern)
        await run(args, project.root, { timeoutMs: 600_000 })
        if (!existsSync(graphFile(project.root))) throw new Error('Graphify completed but graphify-out/graph.json is missing')
        await writeStatus(project.root, 'ready',
          project.documentsStale ? 'Code graph ready. Documents/media require separate semantic refresh.' : 'Graph up to date',
          { watching: !!project.watcher, documentsStale: project.documentsStale })
      } catch (error) { reportFailure(project, error) }
      finally {
        project.running = undefined
        if (project.dirty && !project.closed && !disposed && config().mode==='auto') {
          project.timer = setTimeout(() => { project.timer = undefined; void build(project) }, effectiveDelay())
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
      const root = await resolveProject(workspaceRoot(session), cwd)
      if (disposed || sessions.get(id) !== token) return
      token.root=root
      if(!allowedProject(root,config())||!['auto','open'].includes(config().mode))return
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

  function refreshSettings() {
    if(disposed)return
    for(const p of projects.values()){
      p.closed=true
      clearTimeout(p.timer)
      p.watcher?.close()
    }
    projects.clear()
    // Re-apply policy to known sessions. Any already-running subprocess can
    // finish but its old watcher cannot initiate new work.
    const active=[...sessions].filter(([,token])=>token.root)
    sessions.clear()
    for(const [id,token] of active)void attach({id,header:{cwd:token.root}})
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

  return { attach, detach, rebuild, refreshSettings, stop, activeProjects: () => projects.size }
}

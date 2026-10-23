/**
 * DSH Desktop project lifecycle -> local, code-only Graphify background index.
 * Runs on session creation, not on an Agent prompt or a UI click.
 * Scoped to a real project within the existing DSH sandbox policy root.
 */
import { watch as watchFs, existsSync, statSync, createReadStream } from 'node:fs'
import { createHash } from 'node:crypto'
import { mkdir, writeFile, readFile, rename, rm } from 'node:fs/promises'
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
  if (leaf === '.graphifyignore' || leaf === '.gitignore' || leaf === '.graphifyrc') return 'code'
  if (leaf.startsWith('.')) return 'ignore'
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
  const temporary = join(folder, `.dsh-graphify-status.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`)
  await writeFile(temporary, JSON.stringify(payload) + '\n', { encoding: 'utf8' })
  try {
    // Replace the status atomically so the 2.5s sidebar poll never observes a
    // truncated JSON document and temporarily removes the status bar.
    let failure
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await rename(temporary, path)
        failure = undefined
        break
      } catch (error) {
        failure = error
        if (!['EPERM', 'EBUSY', 'EACCES'].includes(error?.code)) break
        await new Promise(resolve => setTimeout(resolve, 10 * (attempt + 1)))
      }
    }
    if (failure) throw failure
  } finally {
    await rm(temporary, { force: true }).catch(() => {})
  }
}
async function graphRevision(file) {
  if (!existsSync(file)) return null
  const hash=createHash('sha256')
  for await (const part of createReadStream(file)) hash.update(part)
  return hash.digest('hex').slice(0,24)
}
/** Rewrite the sidebar status after a view or advanced command changed graph.json. */
export async function updateGraphStatus(root, detail, extras = {}) {
  const previous = await readFile(join(root, 'graphify-out', STATUS_NAME), 'utf8')
    .then(value => JSON.parse(value)).catch(() => null)
  const revision = await graphRevision(join(root, 'graphify-out', 'graph.html'))
  await writeStatus(root, 'ready',
    revision === null ? 'Graphify did not produce graph.html; the original graph view is unavailable.' : detail,
    {
      watching: previous?.watching === true,
      documentsStale: previous?.documentsStale === true,
      ...extras,
      viewAttempted: true,
      htmlAvailable: revision !== null,
      graphRevision: revision,
    })
  return revision
}
export function createAutoGraphManager({
  run, resolveProject, workspaceRoot, watchImpl = watchFs,
  debounceMs = undefined, minIntervalMs = undefined, getSettings = () => DEFAULT_SETTINGS, log = () => {},
}) {
  const sessions = new Map()
  const projects = new Map()
  const manualBuilds = new Map()
  let disposed = false
  const config=()=>({...DEFAULT_SETTINGS,...getSettings()})
  const effectiveDelay=()=>debounceMs ?? config().debounceSeconds*1000
  // Tests overriding debounceMs retain the old zero-cooldown behavior.
  const effectiveInterval=()=>minIntervalMs ?? (debounceMs === undefined ? config().minIntervalSeconds*1000 : 0)
  const scanPolicy=()=>{const s=config(); return JSON.stringify([s.mode,s.scope,s.allowlist,s.excludePatterns])}
  let priorScanPolicy=scanPolicy()
  function unchangedEvent(project,filename) {
    if (filename == null) return false
    const name=String(filename).replaceAll('\\','/')
    if (isAbsolute(name) || name.split('/').includes('..') || name.includes('\0')) return true
    let signature
    try {
      const st=statSync(join(project.root,name))
      signature=st.mtimeMs + ':' + st.ctimeMs + ':' + st.size + ':' + st.isDirectory()
    } catch { signature='missing' }
    if (project.seen.get(name)===signature) return true
    if (project.seen.size>=2048) project.seen.clear()
    project.seen.set(name,signature)
    return false
  }
  function schedule(project) {
    if(project.closed || disposed || config().mode!=='auto')return
    clearTimeout(project.timer)
    const cooldown=Math.max(0,project.lastCompletedAt+effectiveInterval()-Date.now())
    const wait=Math.max(effectiveDelay(),cooldown)
    project.timer=setTimeout(()=>{project.timer=undefined;void build(project)},wait)
  }

  const graphFile = root => join(root, 'graphify-out', 'graph.json')
  function reportFailure(project, error) {
    const detail = error instanceof Error ? error.message : String(error)
    const written = writeStatus(project.root, 'error', detail).catch(err => log('status write error: ' + err))
    log('Graphify background update: ' + detail)
    return written
  }
  function startWatcher(project) {
    if(config().mode!=='auto')return
    try {
      project.watcher = watchImpl(project.root, { recursive: true }, (_event, filename) => {
        if (project.closed) return
        if(config().mode!=='auto')return
        const kind = classifyChange(filename,config().excludePatterns)
        if (kind === 'ignore' || unchangedEvent(project,filename)) return
        if (kind === 'document') {
          project.documentsStale = true
          if (!project.running) {
            void writeStatus(project.root, 'ready', 'Documents/media changed. Code graph remains usable; semantic re-extraction is manual.', { documentsStale: true, graphRevision: project.graphRevision, htmlAvailable:!!project.graphRevision })
              .catch(error => log(String(error)))
          }
          return
        }
        project.dirty = true
        if(!project.running) schedule(project)
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

  async function build(project, { force = false, manual = false, full = false } = {}) {
    if (project.closed || disposed || (!force && !['auto','open'].includes(config().mode))) return
    if (project.running) {
      // An explicit Agent request joins the current scan; it does not queue a
      // redundant second scan behind the still-running automatic build.
      if (!manual) project.dirty = true
      const runningFull = project.runningFull === true
      const result = await project.running
      if (manual && full && !runningFull) {
        // The in-flight scan may have been incremental. A requested full
        // rebuild must not silently reuse its result.
        return build(project, { force: true, manual: true, full: true })
      }
      if (manual) {
        // An earlier graph.json can survive a failed refresh. Verify the
        // outcome, not merely the existence of an old graph file.
        const status = await readFile(join(project.root, 'graphify-out', STATUS_NAME), 'utf8').then(JSON.parse).catch(() => null)
        if (status?.state === 'error') throw new Error('Graphify indexing failed: ' + status.detail)
        if (!existsSync(graphFile(project.root))) throw new Error('Graphify finished without graph.json; inspect the indexing status')
      }
      return result || 'Graphify indexing already in progress; reused its result.'
    }
    clearTimeout(project.timer)
    project.timer = undefined
    const first = !existsSync(graphFile(project.root))
    project.dirty = false
    project.running = (async () => {
      try {
        await writeStatus(project.root, first || full ? 'building' : 'updating',
          full ? 'Rebuilding the complete local code graph (no AI or token use)'
            : first ? 'Preparing local engine and indexing code (no AI or token use)' : 'Refreshing changed code',
          { watching: !!project.watcher, documentsStale: project.documentsStale })
        const args = ['extract', '.', '--code-only']
        if (full) args.push('--force')
        for(const pattern of config().excludePatterns)args.push('--exclude',pattern)
        const result = await run(args, project.root, { timeoutMs: 600_000 })
        // Settings may have been switched to off while Graphify was running.
        // A stale task must not overwrite the paused status after it exits.
        if (project.closed || disposed) return
        if (!existsSync(graphFile(project.root))) throw new Error('Graphify completed but graphify-out/graph.json is missing')
        // extract only writes graph.json. The original sidebar viewer needs the
        // upstream HTML export, so generate it in the same serialized task.
        let viewError
        try {
          await run(['export','html'], project.root, { timeoutMs: 180_000, maxOutput: 6000 })
        } catch (error) {
          viewError = String(error instanceof Error ? error.message : error).replace(/\s+/g, ' ').slice(0, 300)
        }
        const revision=await graphRevision(join(project.root, 'graphify-out', 'graph.html'))
        const htmlAvailable=revision!==null
        const detail = !htmlAvailable
          ? viewError
            ? 'Code graph ready, but the original graph view could not be generated: ' + viewError
            : 'Code graph ready, but Graphify did not produce graph.html (single-community or oversized graph). Use graphify_view(html) to retry.'
          : project.documentsStale ? 'Code graph ready. Documents/media require separate semantic refresh.' : 'Graph up to date'
        project.graphRevision=revision
        await writeStatus(project.root, 'ready', detail,
          { watching: !!project.watcher, documentsStale: project.documentsStale, viewAttempted: true,
            htmlAvailable, graphRevision:revision, htmlError: viewError })
        project.lastCompletedAt=Date.now()
        const summary = result || 'Graphify code graph updated successfully.'
        return htmlAvailable ? summary : summary + '\nGraph view: ' + detail
      } catch (error) {
        if (!project.closed && !disposed) await reportFailure(project, error)
        // Automatic scans remain non-blocking, while Agent-triggered scans
        // must report real errors instead of silently returning success.
        if (manual) throw error
      }
      finally {
        project.running = undefined
        project.runningFull = undefined
        if (project.dirty && !project.closed && !disposed && config().mode==='auto') {
          schedule(project)
        }
      }
    })()
    project.runningFull = full
    return project.running
  }

  async function attach(session) {
    const id = session?.id
    const cwd = session?.header?.cwd
    if (disposed || typeof id !== 'string' || typeof cwd !== 'string' || sessions.has(id)) return
    const token = { root: undefined, session }
    sessions.set(id, token)
    try {
      const root = await resolveProject(workspaceRoot(session), cwd)
      if (disposed || sessions.get(id) !== token) return
      token.root=root
      if(!allowedProject(root,config())||!['auto','open'].includes(config().mode))return
      // A standalone manual build may have started before this project opened.
      // Finish it first so opening a session cannot overlap its graph writes.
      if (manualBuilds.has(root)) await manualBuilds.get(root).promise.catch(() => {})
      if (disposed || sessions.get(id) !== token) return
      let project = projects.get(root)
      if (!project) {
        project = { root, sessionIds: new Set(), watcher: undefined, timer: undefined, running: undefined, runningFull: undefined, dirty: false, closed: false, documentsStale: false, lastCompletedAt:0, graphRevision:null, seen:new Map() }
        projects.set(root, project)
        startWatcher(project)
        // Every session activation checks the graph, but existing graphs are
        // refreshed incrementally rather than rebuilt from scratch. A ready
        // graph without an attempted view must rebuild so graph.html exists.
        let skipRecent=false
        try {
          const status=JSON.parse(await readFile(join(root,'graphify-out',STATUS_NAME),'utf8'))
          const elapsed=Date.now()-statSync(graphFile(root)).mtimeMs
          const viewSettled=status.htmlAvailable===true || status.viewAttempted===true
          skipRecent=status.state==='ready' && viewSettled && elapsed>=0 && elapsed<effectiveInterval()
          if(skipRecent){project.lastCompletedAt=Date.now();project.graphRevision=status.graphRevision??null}
        } catch { /* no reliable prior ready graph */ }
        if(!skipRecent && !project.closed)void build(project)
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

  /** Agent-triggered build joins automatic scans and updates the same status
   * file. Standalone manual/off projects are serialized too, and still honor
   * scan exclusions without starting file watchers. */
  async function rebuild(root, { full = false } = {}) {
    if (disposed) throw new Error('Graphify project manager is stopped')
    const project = projects.get(root)
    if (project) return build(project, { force: true, manual: true, full })
    const existing = manualBuilds.get(root)
    if (existing) {
      if (!full || existing.full) return existing.promise
      return existing.promise.catch(() => {}).then(() => rebuild(root, { full: true }))
    }
    const temporary = {
      root, watcher: undefined, timer: undefined, running: undefined, runningFull: undefined,
      dirty: false, closed: false, documentsStale: false,
      lastCompletedAt: 0, graphRevision: null, seen: new Map(),
    }
    const pending = build(temporary, { force: true, manual: true, full })
      .finally(() => { manualBuilds.delete(root) })
    manualBuilds.set(root, { promise: pending, full })
    return pending
  }

  function refreshSettings() {
    if(disposed)return
    // Agent-language guidance and timing changes must not rescan projects.
    const nextPolicy=scanPolicy()
    if(nextPolicy===priorScanPolicy)return
    priorScanPolicy=nextPolicy
    const next = config()
    for(const p of projects.values()){
      p.closed=true
      clearTimeout(p.timer)
      p.watcher?.close()
      if (next.mode === 'off' || next.mode === 'manual' || !allowedProject(p.root,next)) {
        void writeStatus(p.root, 'paused', 'Graphify background indexing disabled by current settings', { watching:false })
          .catch(error => log('status write error: ' + error))
      }
    }
    projects.clear()
    // Re-apply policy to known sessions. Any already-running subprocess can
    // finish but its old watcher cannot initiate new work.
    const active=[...sessions].filter(([,token])=>token.root)
    sessions.clear()
    for(const [,token] of active)void attach(token.session)
  }

  function stop() {
    disposed = true
    for (const project of projects.values()) {
      project.closed = true
      clearTimeout(project.timer)
      project.watcher?.close()
    }
    projects.clear()
    manualBuilds.clear()
    sessions.clear()
  }

  return { attach, detach, rebuild, refreshSettings, stop, activeProjects: () => projects.size }
}

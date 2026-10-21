/**
 * DSH-Graphify managed engine runtime.
 *
 * The user installs only the DSH bundle. The FIRST explicit graphify_build
 * invocation provisions uv + Python 3.12 + graphifyy into plugin-owned cache.
 * No global Python/uv/PATH edits, no shell evaluation, and no startup downloads.
 *
 * uv archive version and SHA-256 digests are pinned to the upstream release.
 * Graphify dependency is pinned to the verified open-source package version.
 */
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, open, readFile, readdir, rm, rename, stat, writeFile, chmod } from 'node:fs/promises'
import { homedir, platform as osPlatform, arch as osArch } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'

export const UV_VERSION = '0.13.3'
export const GRAPHIFY_VERSION = '0.9.92'
export const PACKAGE = 'graphifyy==' + GRAPHIFY_VERSION
const ASSETS = {
  'win32:x64': ['uv-x86_64-pc-windows-msvc.zip', 'bb701bd35b586c45966654ea2703c9bd116a6a4fc0a8ca755bd644c2c41c5ebe'],
  'win32:arm64': ['uv-aarch64-pc-windows-msvc.zip', 'aeaca1a1b721c1686c09b4aa23d57f938df049bed1b8e534b5bf79a032b8b87b'],
  'darwin:x64': ['uv-x86_64-apple-darwin.tar.gz', '5c35634957db7ebd9c2e4cc6c66b8979fb2c26a6b0dbd1d214d6acbac4033a89'],
  'darwin:arm64': ['uv-aarch64-apple-darwin.tar.gz', 'bf1e4fb6f5f5079a2902ad3f3a9e2d337575b226a1378f2449d8404353650608'],
  'linux:x64': ['uv-x86_64-unknown-linux-gnu.tar.gz', 'e4f169ec380f1793b898a6f1fcbacd22db25cf7ca0349a6e96ffb85b69998d04'],
  'linux:arm64': ['uv-aarch64-unknown-linux-gnu.tar.gz', '611ff684f193a84d2fdad29c5f12505d02ece94984c7c982cdde950eba5c95b9'],
}
export function assetFor(platform = osPlatform(), arch = osArch()) {
  const asset = ASSETS[platform + ':' + arch]
  if (!asset) throw new Error('DSH-Graphify managed engine does not yet support ' + platform + '/' + arch)
  return {
    name: asset[0],
    digest: asset[1],
    url: 'https://github.com/astral-sh/uv/releases/download/' + UV_VERSION + '/' + asset[0],
  }
}
export function baseDirectory(platform = osPlatform(), env = process.env) {
  const base = platform === 'win32' && env.LOCALAPPDATA
    ? env.LOCALAPPDATA
    : (env.XDG_CACHE_HOME || join(homedir(), '.cache'))
  return resolve(base, 'DSH-Graphify', 'engine-v2')
}
export function runtimePaths(root = baseDirectory(), platform = osPlatform()) {
  return {
    root,
    uv: join(root, platform === 'win32' ? 'uv.exe' : 'uv'),
    python: join(root, 'venv', platform === 'win32' ? 'Scripts' : 'bin', platform === 'win32' ? 'python.exe' : 'python'),
    executable: join(root, 'venv', platform === 'win32' ? 'Scripts' : 'bin', platform === 'win32' ? 'graphify.exe' : 'graphify'),
    marker: join(root, 'ready.json'),
    lock: join(root, 'setup.lock'),
  }
}
function environment(paths) {
  return {
    ...process.env,
    UV_PYTHON_INSTALL_DIR: join(paths.root, 'python'),
    UV_CACHE_DIR: join(paths.root, 'cache'),
    UV_NO_PROGRESS: '1',
    UV_NO_ANALYTICS: '1',
  }
}
/** Fixed argv, no shell; bounded output and deadline. */
export function runProgram(command, args, { cwd, env = process.env, timeoutMs = 180_000, maxOutput = 12_000 } = {}) {
  return new Promise((resolvePromise, reject) => {
    let child
    try {
      child = spawn(command, args, { cwd, env, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (error) { reject(error); return }
    let output = '', timedOut = false, done = false
    const append = chunk => { output = (output + String(chunk)).slice(-maxOutput) }
    child.stdout.on('data', append)
    child.stderr.on('data', append)
    const timeout = setTimeout(() => {
      timedOut = true
      child.kill()
    }, timeoutMs)
    function finish(error, result) {
      if (done) return
      done = true
      clearTimeout(timeout)
      if (error) reject(error)
      else resolvePromise(result)
    }
    child.on('error', error => finish(error))
    child.on('close', code => {
      if (timedOut) return finish(new Error('Command timed out: ' + command))
      if (code !== 0) return finish(new Error('Command failed (' + code + '): ' + output.trim()))
      finish(null, output.trim())
    })
  })
}
async function downloadVerified(asset, fetchImpl = fetch) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 120_000)
  try {
    const response = await fetchImpl(asset.url, { redirect: 'follow', signal: controller.signal })
    if (!response.ok) throw new Error('Download failed: HTTP ' + response.status)
    const contentLength = Number(response.headers.get('content-length') || 0)
    if (contentLength > 65 * 1024 * 1024) throw new Error('uv archive exceeds 65 MiB')
    const chunks = []
    let bytes = 0
    for await (const chunk of response.body) {
      bytes += chunk.length
      if (bytes > 65 * 1024 * 1024) throw new Error('uv archive exceeds 65 MiB')
      chunks.push(chunk)
    }
    const data = Buffer.concat(chunks, bytes)
    const digest = createHash('sha256').update(data).digest('hex')
    if (digest !== asset.digest) throw new Error('uv release archive SHA-256 verification failed')
    return data
  } finally {
    clearTimeout(timeout)
  }
}
async function findUv(folder, executable, depth = 3) {
  if (depth < 0) return undefined
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name)
    if (entry.isFile() && entry.name === executable) return path
    if (entry.isDirectory()) {
      const found = await findUv(path, executable, depth - 1)
      if (found) return found
    }
  }
  return undefined
}
async function isReady(paths) {
  if (!existsSync(paths.executable)) return false
  try {
    const marker = JSON.parse(await readFile(paths.marker, 'utf8'))
    return marker.graphify === GRAPHIFY_VERSION && marker.uv === UV_VERSION
  } catch { return false }
}
const wait = ms => new Promise(resolvePromise => setTimeout(resolvePromise, ms))
async function lockSetup(paths, install) {
  const deadline = Date.now() + 10 * 60 * 1000
  for (;;) {
    if (await isReady(paths)) return paths.executable
    let file
    try { file = await open(paths.lock, 'wx') }
    catch (error) {
      if (error.code !== 'EEXIST') throw error
      const age = await stat(paths.lock).then(s => Date.now() - s.mtimeMs).catch(() => 0)
      if (age > 20 * 60 * 1000) await rm(paths.lock, { force: true })
      if (Date.now() > deadline) throw new Error('Graphify setup is locked by another DSH process')
      await wait(800)
      continue
    }
    try {
      await file.writeFile(String(process.pid))
      await file.close()
      if (await isReady(paths)) return paths.executable
      await install()
      if (!(await isReady(paths))) throw new Error('Graphify engine installation did not complete')
      return paths.executable
    } finally {
      await file.close().catch(() => {})
      await rm(paths.lock, { force: true })
    }
  }
}
export async function provisionRuntime(paths = runtimePaths(), options = {}) {
  if (await isReady(paths)) return paths.executable
  await mkdir(paths.root, { recursive: true })
  return lockSetup(paths, async () => {
    const env = environment(paths)
    if (!existsSync(paths.uv)) {
      const archive = assetFor()
      const data = await downloadVerified(archive, options.fetchImpl)
      const staged = join(paths.root, '.extract-' + process.pid + '-' + Date.now())
      await mkdir(staged, { recursive: true })
      try {
        const filePath = join(staged, archive.name)
        await writeFile(filePath, data)
        await runProgram('tar', ['-xf', filePath, '-C', staged], { timeoutMs: 90_000 })
        const found = await findUv(staged, osPlatform() === 'win32' ? 'uv.exe' : 'uv')
        if (!found) throw new Error('uv executable missing from verified archive')
        await copyFile(found, paths.uv)
        if (osPlatform() !== 'win32') await chmod(paths.uv, 0o755)
      } finally { await rm(staged, { recursive: true, force: true }) }
    }
    if (!existsSync(paths.python)) {
      await runProgram(paths.uv, ['venv', '--python', '3.12', '--python-preference', 'only-managed', join(paths.root, 'venv')], {
        cwd: paths.root, env, timeoutMs: 300_000,
      })
    }
    await runProgram(paths.uv, ['pip', 'install', '--python', paths.python, PACKAGE], {
      cwd: paths.root, env, timeoutMs: 420_000,
    })
    if (!existsSync(paths.executable)) throw new Error('Graphify launcher was not installed')
    await writeFile(paths.marker, JSON.stringify({ graphify: GRAPHIFY_VERSION, uv: UV_VERSION, installed: new Date().toISOString() }) + '\n')
  })
}
let pendingRuntime
export function ensureRuntime() {
  if (!pendingRuntime) pendingRuntime = provisionRuntime().catch(error => {
    pendingRuntime = undefined
    throw new Error('DSH-Graphify first-use setup failed: ' + error.message + '. Check internet access and retry.')
  })
  return pendingRuntime
}
export async function runGraphify(args, cwd, { timeoutMs = 180_000, maxOutput = 8192 } = {}) {
  const executable = process.env.DSH_GRAPHIFY_BIN || await ensureRuntime()
  const output = await runProgram(executable, args, { cwd, timeoutMs, maxOutput })
  return output || 'Graphify complete. Refresh the Graphify right sidebar tab.'
}

/**
 * Explicit advanced setup: install selected OFFICIAL Graphify optional extras.
 * Never called by auto-indexing or ordinary Agent graph queries.
 * The allowlist prevents arbitrary pip package injection through Agent args.
 */
const OPTIONAL_EXTRAS = new Set([
  'mcp','pdf','office','video','svg','neo4j','falkordb',
  'postgres','watch','openai','gemini','anthropic','ollama',
  'kimi','sql','chinese','pascal','terraform','r','erlang',
])
export async function installGraphifyExtras(extras,{timeoutMs=900_000}={}) {
  if(!Array.isArray(extras)||extras.length<1||extras.length>10||extras.some(x=>!OPTIONAL_EXTRAS.has(x)))
    throw Error('Select 1–10 supported Graphify optional extras')
  await ensureRuntime()
  const paths=runtimePaths()
  const unique=[...new Set(extras)].sort()
  // Reuse existing pinned version, do not mutate PATH, global Python or
  // upgrade Graphify to an unverified release.
  const requirement='graphifyy['+unique.join(',')+']=='+GRAPHIFY_VERSION
  return await runProgram(paths.uv,['pip','install','--python',paths.python,requirement],{
    cwd:paths.root,env:environment(paths),timeoutMs,maxOutput:12000,
  })
}

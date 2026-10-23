import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import {
  UV_VERSION, GRAPHIFY_VERSION, PACKAGE, VIZ_NODE_LIMIT, assetFor,
  baseDirectory, runtimePaths, runProgram, runGraphify, provisionRuntime,
} from '../src/runtime.js'

test('supported uv assets are version and checksum pinned for desktop OSes', () => {
  assert.equal(PACKAGE, 'graphifyy==' + GRAPHIFY_VERSION)
  assert.match(UV_VERSION, /^\d+\.\d+\.\d+$/)
  for (const [os, arch] of [
    ['win32','x64'], ['win32','arm64'], ['darwin','x64'],
    ['darwin','arm64'], ['linux','x64'], ['linux','arm64'],
  ]) {
    const asset = assetFor(os, arch)
    assert.match(asset.digest, /^[a-f0-9]{64}$/)
    assert.ok(asset.url.endsWith('/' + asset.name))
  }
  assert.throws(() => assetFor('win32', 'ia32'), /does not yet support/)
})

test('Windows engine lives under plugin-owned local app data', () => {
  const root = baseDirectory('win32', { LOCALAPPDATA: 'C:\\Users\\Tester\\AppData\\Local' })
  assert.match(root, /DSH-Graphify/)
  const paths = runtimePaths(root, 'win32')
  assert.match(paths.executable, /graphify\.exe$/)
  assert.match(paths.python, /python\.exe$/)
  assert.match(paths.uv, /uv\.exe$/)
})

test('subprocess runner executes argv without shell expansion', async () => {
  const output = await runProgram(process.execPath, ['-e', "process.stdout.write(process.argv[1])", 'hello;echo injection'])
  assert.equal(output, 'hello;echo injection')
  await assert.rejects(
    runProgram(process.execPath, ['-e', 'process.exit(12)']),
    /Command failed \(12\)/,
  )
})

test('managed Graphify commands receive the large-graph visualization limit', async () => {
  const previousBin = process.env.DSH_GRAPHIFY_BIN
  const previousLimit = process.env.GRAPHIFY_VIZ_NODE_LIMIT
  process.env.DSH_GRAPHIFY_BIN = process.execPath
  delete process.env.GRAPHIFY_VIZ_NODE_LIMIT
  try {
    const output = await runGraphify(
      ['-e', 'process.stdout.write(String(process.env.GRAPHIFY_VIZ_NODE_LIMIT))'],
      process.cwd(),
      { timeoutMs: 30_000 },
    )
    assert.equal(output, VIZ_NODE_LIMIT)
  } finally {
    if (previousBin === undefined) delete process.env.DSH_GRAPHIFY_BIN
    else process.env.DSH_GRAPHIFY_BIN = previousBin
    if (previousLimit === undefined) delete process.env.GRAPHIFY_VIZ_NODE_LIMIT
    else process.env.GRAPHIFY_VIZ_NODE_LIMIT = previousLimit
  }
})

test('tampered uv archive is rejected and leaves no ready engine', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'graphify-native-'))
  try {
    const response = {
      ok: true,
      status: 200,
      headers: { get: () => null },
      body: Readable.from([Buffer.from('invalid release payload')]),
    }
    let calls = 0
    const paths = runtimePaths(temp)
    await assert.rejects(
      provisionRuntime(paths, { fetchImpl: async () => { calls++; return response } }),
      /SHA-256 verification failed/,
    )
    assert.equal(calls, 1)
    await assert.rejects(access(paths.marker))
    await assert.rejects(access(paths.lock))
  } finally { await rm(temp, { recursive: true, force: true }) }
})

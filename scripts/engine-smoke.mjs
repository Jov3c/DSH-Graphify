/**
 * Optional real-engine smoke test. Requires a provisioned managed engine or
 * DSH_GRAPHIFY_BIN pointing at a Graphify 0.9.92 executable.
 * Run with: npm run smoke
 */
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAutoGraphManager } from '../src/auto.js'
import { runGraphify } from '../src/runtime.js'

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const base = await mkdtemp(join(tmpdir(), 'dsh-graphify-smoke-'))
let manager
try {
  await mkdir(join(base, 'src'))
  await writeFile(join(base, 'src', 'main.js'), 'import { helper } from "./helper.js"\nexport function main(){ return helper() }\n')
  await writeFile(join(base, 'src', 'helper.js'), 'export function helper(){ return 1 }\n')
  await writeFile(join(base, 'src', 'util.js'), 'import { helper } from "./helper.js"\nexport function util(){ return helper() }\n')
  manager = createAutoGraphManager({
    run: runGraphify,
    resolveProject: async (_root, path) => realpath(path),
    workspaceRoot: () => base,
    getSettings: () => ({ mode: 'auto', scope: 'sessions', excludePatterns: [], debounceSeconds: 20, minIntervalSeconds: 180 }),
  })
  await manager.attach({ id: 'engine-smoke', header: { cwd: base } })
  const deadline = Date.now() + 180_000
  let status
  while (Date.now() < deadline) {
    status = await readFile(join(base, 'graphify-out', '.dsh-graphify-status.json'), 'utf8')
      .then(JSON.parse).catch(() => null)
    if (status?.state === 'ready' || status?.state === 'error') break
    await wait(500)
  }
  if (status?.state !== 'ready') throw new Error('Graphify smoke did not finish: ' + JSON.stringify(status))
  if (status.htmlAvailable !== true) throw new Error('graph.html was not generated: ' + status.detail)
  const html = await readFile(join(base, 'graphify-out', 'graph.html'), 'utf8')
  for (const marker of ['<div id="graph"></div>', '<div id="sidebar">', 'new vis.Network(', 'https://unpkg.com/vis-network@9.1.6/']) {
    if (!html.includes(marker)) throw new Error('Generated graph.html is missing ' + marker)
  }
  console.log('Engine smoke passed: graph.json + graph.html generated, status htmlAvailable=true')
} finally {
  manager?.stop()
  await rm(base, { recursive: true, force: true })
}

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mkdtemp, mkdir, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = readFileSync(join(root, 'src/index.js'), 'utf8')
const stub = source.replace("import { defineTool } from '@deepseek-ai/dsh-tools'", 'const defineTool = x => x')
  .replace("import { runGraphify } from './runtime.js'\nexport { runGraphify } from './runtime.js'", "const runGraphify = async () => 'mock Graphify'\nexport { runGraphify }")
const host = await import('data:text/javascript,' + encodeURIComponent(stub))
test('Host plugin exports two native DSH Agent tools', () => {
  const list = []
  const ctx = { sandboxPolicy: { workspaceRoot: tmpdir() }, tools: { register: x => list.push(x) } }
  host.apply(ctx)
  assert.deepEqual(list.map(x => x.name), ['graphify_build', 'graphify_query'])
  assert.ok(list[0].parameters.directory)
})
test('Workspace path validator blocks .. and symbolic-link escapes', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'dsh-graphify-'))
  const base = join(temp, 'base'), inside = join(base, 'inside'), outside = join(temp, 'outside')
  try {
    await mkdir(inside, { recursive: true })
    await mkdir(outside)
    assert.equal(await host.projectDirectory(base, 'inside'), inside)
    assert.equal(await host.projectDirectory(base), base)
    await assert.rejects(host.projectDirectory(base, '../outside'), /outside/)
    if (process.platform !== 'win32') {
      await symlink(outside, join(base, 'escape'))
      await assert.rejects(host.projectDirectory(base, 'escape'), /outside/)
    }
  } finally { await rm(temp, { recursive: true, force: true }) }
})

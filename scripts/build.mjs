import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
const id = manifest.name
const body = await readFile(resolve(root, 'src/client.js'), 'utf8')
if (/\bimport\s|\bexport\s/.test(body)) throw new Error('Browser client body must be CommonJS factory-safe')
const wrapped = [
  `/* Generated from src/client.js. DO NOT EDIT. */`,
  `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => {`,
  `var module = { exports: {} }; var exports = module.exports;`,
  body,
  `return module.exports; } });`,
  '',
].join('\n')
await mkdir(resolve(root, 'lib'), { recursive: true })
await writeFile(resolve(root, 'lib/client.js'), wrapped)
await copyFile(resolve(root, 'src/index.js'), resolve(root, 'lib/index.js'))
console.log(`Built DSH plugin ${id}`)

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { inspectImpactGraph, readImpactContext } from '../src/impact-context.js'

const fixture={
  nodes:[
    {id:'login',label:'BrowserLoginCoordinator',source_file:'src/browser-login.mjs',file_type:'code'},
    {id:'main',label:'main.mjs',source_file:'src/main.mjs',file_type:'code'},
    {id:'settings',label:'settingsCard()',source_file:'src/settings-card.mjs',file_type:'code'},
    {id:'source',label:'BrowserPlatformSource',source_file:'src/browser-source.mjs',file_type:'code'},
    {id:'test',label:'browser-login.test.mjs',source_file:'test/browser-login.test.mjs',file_type:'code'},
    {id:'doc',label:'login-design.md',source_file:'docs/login-design.md',file_type:'document'},
  ],
  links:[
    {source:'main',target:'login',relation:'imports',source_location:'L15'},
    {source:'test',target:'login',relation:'imports',source_location:'L3'},
    {source:'main',target:'settings',relation:'imports',source_location:'L18'},
    {source:'main',target:'source',relation:'imports_from',source_location:'L17'},
    {source:'main',target:'doc',relation:'references'},
  ],
}

test('affected context separates confirmed static edges and co-import hypotheses',()=>{
  const ctx=inspectImpactGraph(fixture,'BrowserLoginCoordinator')
  assert.equal(ctx.resolved,true)
  assert.equal(ctx.nodes,6)
  assert.equal(ctx.edges,5)
  assert.deepEqual(ctx.confirmed.map(x=>x.file),['src/main.mjs','test/browser-login.test.mjs'])
  assert.deepEqual(new Set(ctx.candidates.map(x=>x.file)),new Set(['src/settings-card.mjs','src/browser-source.mjs']))
  assert.equal(ctx.tests.some(x=>x.file==='test/browser-login.test.mjs'),true)
  assert.equal(ctx.candidates.some(x=>x.file==='docs/login-design.md'),false)
  assert.match(ctx.note,/NOT proven impacted/)
})
test('ambiguous and missing nodes do not claim to resolve a seed',()=>{
  assert.equal(inspectImpactGraph(fixture,'missing').resolved,false)
  const ambiguous={...fixture,nodes:[...fixture.nodes,{id:'dup',label:'BrowserLoginCoordinator',source_file:'src/other.mjs'}]}
  assert.equal(inspectImpactGraph(ambiguous,'BrowserLoginCoordinator').ambiguity,2)
  const unbound={...fixture,links:[...fixture.links,{source:'missing',target:'login',relation:'calls'}]}
  assert.equal(inspectImpactGraph(unbound,'BrowserLoginCoordinator').resolved,true)
})
test('audit reads graph locally, limits output, and does not imply source confirmed',async()=>{
  const root=await mkdtemp(join(tmpdir(),'gfy-impact-'))
  try{
    await mkdir(join(root,'graphify-out'))
    await writeFile(join(root,'graphify-out','graph.json'),JSON.stringify(fixture))
    const summary=await readImpactContext(root,'BrowserLoginCoordinator')
    assert.match(summary,/Total indexed nodes: 6; graph relations: 5/)
    assert.match(summary,/settings-card\.mjs/)
    assert.match(summary,/NOT confirmed affected/)
    assert.match(summary,/inspect actual source event handlers/)
  }finally{await rm(root,{recursive:true,force:true})}
})

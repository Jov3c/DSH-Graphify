import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { extraToolDescriptors, graphStats } from '../src/capabilities.js'
const fixture={nodes:[
{id:'a',label:'A',source_file:'src/main.ts'},
{id:'b',label:'B',source_file:'src/dep.ts'},
{id:'isolated',label:'Isolated',source_file:'src/unused.ts'}
],links:[{source:'a',target:'b',relation:'imports'},{source:'a',target:'missing',relation:'calls'}]}
const setup=async()=>{
  const root=await mkdtemp(join(tmpdir(),'gfy-extra-'))
  await mkdir(join(root,'graphify-out'))
  await writeFile(join(root,'graphify-out','graph.json'),JSON.stringify(fixture))
  return root
}
const toolSuite=(root,settings,call)=>{
  const calls=[]
  const run=async(args)=>{calls.push(args);return 'Graphify CLI done'}
  const config=()=>({...{advancedActions:false,networkActions:false,excludePatterns:[]},...settings})
  const tools=extraToolDescriptors({project:async()=>root,run:call||run,settings:config})
  const find=name=>tools.find(t=>t.name===name)
  return {calls,find,tools}
}
test('project graph health reports actual counts and unresolved links without inventing source coverage',async()=>{
 const root=await setup()
 try{
  const r=await graphStats(root)
  assert.equal(r.nodes,3)
  assert.equal(r.edges,2)
  assert.equal(r.indexedFiles,3)
  assert.equal(r.isolatedNodes,1)
  assert.equal(r.unresolvedEndpoints,1)
  assert.match(r.note,/NOT source coverage/)
  const suite=toolSuite(root)
  const health=await suite.find('graphify_health').execute({})
  assert.match(health,/"indexedFiles": 3/)
  const result=await suite.find('graphify_health').execute({detail:'multigraph'})
  assert.match(result,/Graphify CLI done/)
  assert.deepEqual(suite.calls.at(-1),['diagnose','multigraph','--json'])
 }finally{await rm(root,{recursive:true,force:true})}
})
test('exposes safe read-only upstream tree, callflow, wiki, PR and hook status',async()=>{
 const root=await setup()
 try{
  const s=toolSuite(root)
  for(const [name,args,expect] of [
    ['graphify_view',{view:'tree'},['tree','--output','graphify-out/GRAPH_TREE.html']],
    ['graphify_view',{view:'callflow'},['export','callflow-html','--output','graphify-out/GRAPH_CALLFLOW.html']],
    ['graphify_export',{format:'wiki'},['export','wiki']],
    ['graphify_export',{format:'obsidian'},['export','obsidian']],
    ['graphify_export',{format:'graphml'},['export','graphml']],
    ['graphify_workflow',{operation:'hook-status'},['hook','status']],
    ['graphify_workflow',{operation:'global-list'},['global','list']]
  ]){
    assert.match(await s.find(name).execute(args),/Graphify CLI done/)
    assert.deepEqual(s.calls.at(-1),expect)
  }
  await assert.rejects(s.find('graphify_export').execute({format:'neo4j'}),/Unsupported/)
  await assert.rejects(s.find('graphify_workflow').execute({operation:'rm -rf /'}),/Unsupported/)
  await assert.rejects(s.find('graphify_workflow').execute({operation:'pr-conflicts'}),/Enable Advanced actions/)
 }finally{await rm(root,{recursive:true,force:true})}
})
test('local mutations, hooks, merges, external URLs and AI analysis remain disabled by default',async()=>{
 const root=await setup()
 try{
  const s=toolSuite(root)
  for(const [name,arg] of [
    ['graphify_git',{action:'install'}],
    ['graphify_memory',{action:'reflect'}],
    ['graphify_merge',{graphs:['a.json','b.json']}],
    ['graphify_add',{url:'https://example.org/paper'}],
    ['graphify_semantic',{backend:'deepseek'}],
  ]){
    await assert.rejects(s.find(name).execute(arg),/Enable Advanced actions/)
  }
  assert.equal(s.calls.length,0)
 }finally{await rm(root,{recursive:true,force:true})}
})
test('when opted in, the typed CLI cannot escape authorized project paths or use local URL inputs',async()=>{
 const root=await setup()
 try{
  const s=toolSuite(root,{advancedActions:true,networkActions:true})
  await s.find('graphify_workflow').execute({operation:'pr-conflicts'})
  assert.deepEqual(s.calls.at(-1),['prs','--conflicts'])
  await s.find('graphify_git').execute({action:'install'})
  assert.deepEqual(s.calls.at(-1),['hook','install'])
  await s.find('graphify_memory').execute({action:'reflect'})
  assert.deepEqual(s.calls.at(-1),['reflect','--if-stale'])
  await assert.rejects(s.find('graphify_merge').execute({graphs:['../../escape.json','src/a.json']}),/Graph file must stay within/)
  await assert.rejects(s.find('graphify_add').execute({url:'http://example.org'}),/Only credential-free HTTPS/)
  await assert.rejects(s.find('graphify_add').execute({url:'https://127.0.0.1/private'}),/Local\/private addresses/)
  await s.find('graphify_semantic').execute({backend:'ollama',budget:4000})
  assert.deepEqual(s.calls.find(call=>call[0]==='extract'&&call.includes('--backend')),['extract','.','--backend','ollama','--token-budget','4000'])
  assert.deepEqual(s.calls.at(-1),['export','html'],'semantic extraction must regenerate the sidebar view')
 }finally{await rm(root,{recursive:true,force:true})}
})

test('global registry, cluster, PR detail, and clone use fixed typed CLI arguments',async()=>{
  const root=await setup()
  try{
    const s=toolSuite(root,{advancedActions:true,networkActions:true})
    await s.find('graphify_cluster').execute({resolution:1.5})
    assert.deepEqual(s.calls.find(call=>call[0]==='cluster-only'),['cluster-only','.','--resolution','1.5','--no-label'])
    assert.deepEqual(s.calls.at(-1),['export','html'],'clustering must regenerate the sidebar view')
    await s.find('graphify_pr').execute({mode:'detail',number:42})
    assert.deepEqual(s.calls.at(-1),['prs','42'])
    await s.find('graphify_pr').execute({mode:'triage'})
    assert.deepEqual(s.calls.at(-1),['prs','--triage'])
    await s.find('graphify_global').execute({action:'list'})
    assert.deepEqual(s.calls.at(-1),['global','list'])
    await s.find('graphify_global').execute({action:'add',file:'graphify-out/graph.json',tag:'primary'})
    assert.deepEqual(s.calls.at(-1).slice(0,2),['global','add'])
    assert.deepEqual(s.calls.at(-1).slice(-2),['--as','primary'])
    await s.find('graphify_clone').execute({url:'https://github.com/example/repository',folder:'repository'})
    assert.equal(s.calls.at(-1)[0],'clone')
    assert.equal(s.calls.at(-1)[3].endsWith('repository'),true)
    await assert.rejects(s.find('graphify_clone').execute({url:'https://evil.example/example/repository',folder:'repo'}),/Only public github.com/)
    await assert.rejects(s.find('graphify_clone').execute({url:'https://github.com/example/repository',folder:'../../escape'}),/Graph file must stay within/)
  }finally{await rm(root,{recursive:true,force:true})}
})
test('GitHub PR requests require remote authorization, while local inspection remains available',async()=>{
 const root=await setup()
 try{
  const s=toolSuite(root)
  await assert.rejects(s.find('graphify_pr').execute({mode:'detail',number:4}),/Enable Network\/AI/)
  await s.find('graphify_global').execute({action:'list'})
  assert.deepEqual(s.calls.at(-1),['global','list'])
  await assert.rejects(s.find('graphify_global').execute({action:'remove',tag:'x'}),/Enable Advanced/)
 }finally{await rm(root,{recursive:true,force:true})}
})

test('graphify_view(html) regenerates the original view and updates sidebar status',async()=>{
 const root=await setup()
 try{
  const calls=[]
  const run=async(args,cwd)=>{
    calls.push(args)
    if(args[0]==='export'&&args[1]==='html')await writeFile(join(cwd,'graphify-out','graph.html'),'<html></html>')
    return 'Graphify CLI done'
  }
  const tools=extraToolDescriptors({project:async()=>root,run,settings:()=>({advancedActions:false,networkActions:false,excludePatterns:[]})})
  const result=await tools.find(t=>t.name==='graphify_view').execute({view:'html'})
  assert.deepEqual(calls.at(-1),['export','html'])
  assert.match(result,/next status poll|Refresh/)
  const status=JSON.parse(await readFile(join(root,'graphify-out','.dsh-graphify-status.json'),'utf8'))
  assert.equal(status.state,'ready')
  assert.equal(status.htmlAvailable,true)
  assert.match(status.graphRevision,/^[a-f0-9]{24}$/)
 }finally{await rm(root,{recursive:true,force:true})}
})

test('optional dependency preparation requires opt-in and passes only typed extras',async()=>{
 const root=await setup()
 try{
  let installCount=0,received=null
  const project=async()=>root
  const installer=async extras=>{installCount++;received=extras;return 'Extras installed'}
  const run=async()=>'ok'
  const disabled=extraToolDescriptors({project,run,installExtras:installer,settings:()=>({advancedActions:false,networkActions:false})})
  await assert.rejects(disabled.find(t=>t.name==='graphify_dependencies').execute({extras:['mcp']}),/Enable Advanced/)
  assert.equal(installCount,0)
  const enabled=extraToolDescriptors({project,run,installExtras:installer,settings:()=>({advancedActions:true,networkActions:true})})
  assert.equal(await enabled.find(t=>t.name==='graphify_dependencies').execute({extras:['mcp','pdf']}),'Extras installed')
  assert.deepEqual(received,['mcp','pdf'])
  assert.equal(installCount,1)
 }finally{await rm(root,{recursive:true,force:true})}
})

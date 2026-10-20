import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { graphifyAgentGuidance, projectPolicy } from '../src/agent-guidance.js'

const config={agentUsage:'smart', mode:'auto', scope:'sessions', allowlist:[]}
const session=(id,cwd)=>({id,header:{cwd}})

test('no guidance for general/non-project chat, disabled preference, or out-of-policy sessions',()=>{
  const root=resolve(tmpdir(),'example-allowed')
  assert.equal(graphifyAgentGuidance({session:null,policyRoot:root,settings:config}),'')
  assert.equal(graphifyAgentGuidance({session:session('s','relative/path'),policyRoot:root,settings:config}),'')
  assert.equal(graphifyAgentGuidance({session:session('s',resolve(root,'../outside')),policyRoot:root,settings:config}),'')
  assert.equal(graphifyAgentGuidance({session:session('s',root),policyRoot:root,settings:{...config,agentUsage:'off'}}),'')
  assert.equal(projectPolicy(session('a',root),root,{...config,scope:'allowlist',allowlist:[]}),null)
})

test('smart natural-language guidance uses graph for code tasks without forcing tool calls for greetings',async()=>{
  const root=await mkdtemp(join(tmpdir(),'dsh-graphify-intent-'))
  try{
    const current=session('s',root)
    const missing=graphifyAgentGuidance({session:current,policyRoot:root,settings:config})
    assert.match(missing,/OPTIONAL/)
    assert.match(missing,/greetings/)
    assert.match(missing,/graphify_build/)
    assert.match(missing,/never block/i)
    await mkdir(join(root,'graphify-out'))
    await writeFile(join(root,'graphify-out','graph.json'),'{}')
    const available=graphifyAgentGuidance({session:current,policyRoot:root,settings:config})
    for(const name of ['graphify_query','graphify_explain','graphify_path','graphify_affected'])assert.ok(available.includes(name))
    assert.match(available,/contains graphify-out\/graph\.json/)
    assert.doesNotMatch(available,/No graph.json exists yet/)
  } finally {await rm(root,{recursive:true,force:true})}
})

test('no unauthorized autoconstruction in manual mode and only explicit usage in on-request mode',()=>{
  const root=resolve(tmpdir(),'graphify-guidance-manual')
  const current=session('s',root)
  const manual=graphifyAgentGuidance({session:current,policyRoot:root,settings:{...config,mode:'manual'},exists:()=>false})
  assert.match(manual,/Do not call graphify_build unless/)
  const requested=graphifyAgentGuidance({session:current,policyRoot:root,settings:{...config,agentUsage:'on-request'}})
  assert.match(requested,/Only use Graphify tools when the user explicitly requests/)
  assert.doesNotMatch(requested,/Prefer querying/)
  const white=graphifyAgentGuidance({session:current,policyRoot:root,settings:{...config,scope:'allowlist',allowlist:[]}})
  assert.equal(white,'')
})

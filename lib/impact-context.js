/**
 * Non-authoritative context for Graphify affected results.
 * Never promote shared imports or matching tests to confirmed impact.
 * No model calls, file writes, network, or source execution.
 */
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

const IMPORTS = new Set(['imports', 'imports_from', 'dynamic_import', 're_exports'])
const MAX_BYTES = 32 * 1024 * 1024
const clean = value => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 180)
const source = node => clean(node?.source_file ?? '')
const label = node => clean(node?.label ?? node?.id ?? '?')
const testFile = path => /(^|\/)(test|tests|__tests__)\//i.test(path) || /\.(test|spec)\.[cm]?[jt]sx?$/i.test(path)

export function inspectImpactGraph(raw, requested, { maxCandidates = 14 } = {}) {
  const nodes = Array.isArray(raw?.nodes) ? raw.nodes : []
  const edges = Array.isArray(raw?.links) ? raw.links : Array.isArray(raw?.edges) ? raw.edges : []
  const byId = new Map(nodes.filter(n=>n && typeof n.id==='string').map(n => [n.id, n]))
  const term = String(requested).trim().toLocaleLowerCase()
  const equals = nodes.filter(n => [n?.id,n?.label,n?.norm_label,n?.source_file].some(x=>typeof x==='string' && x.toLocaleLowerCase()===term))
  const bare = equals.length ? equals : nodes.filter(n=>typeof n?.label==='string' && n.label.toLocaleLowerCase().replace(/\(\)$/,'')===term)
  if(bare.length !== 1) return {
    nodes: nodes.length, edges: edges.length,
    resolved: false, ambiguity: bare.length,
    note: bare.length ? 'Several nodes matched this name. Use a full source-file path or unique symbol.' : 'No unique node match. Query the graph or source for an exact symbol.',
    confirmed: [], candidates: [], tests: [],
  }
  const seed = bare[0]
  const direct = edges.filter(e => e && String(e.target)===seed.id &&
    ['calls','indirect_call','imports','imports_from','references','dynamic_import','re_exports','uses','extends','inherits','implements'].includes(e.relation))
  const directDependents = [...new Map(direct.flatMap(e => {
    const n=byId.get(e.source)
    return n ? [[n.id,{label:label(n),file:source(n),relation:clean(e.relation),location:clean(e.source_location || n.source_location || '')}]] : []
  })).values()].slice(0, 16)
  const parentIds = new Set(edges.filter(e=>String(e.target)===seed.id && IMPORTS.has(e.relation)).map(e=>e.source))
  const candidates = new Map()
  const tests = new Map()
  for(const edge of edges){
    const n=byId.get(edge?.target)
    if(!n||edge?.target===seed.id||!parentIds.has(edge?.source)||!IMPORTS.has(edge.relation))continue
    const file=source(n)
    if(!file||file===source(seed)||n.file_type==='document'||n.file_type==='concept') continue
    const parent=byId.get(edge.source)
    const entry={name:label(n),file,reason:'shares importer '+source(parent)}
    const key=file
    if(testFile(file))tests.set(key,entry)
    else if(!candidates.has(key))candidates.set(key,entry)
  }
  for(const entry of directDependents){
    if(testFile(entry.file))tests.set(entry.file,{name:entry.label,file:entry.file,reason:'direct graph dependency'})
  }
  return {
    nodes:nodes.length,edges:edges.length,resolved:true,
    seed:{name:label(seed),file:source(seed)},
    confirmed:directDependents,
    candidates:[...candidates.values()].slice(0,maxCandidates),
    candidateTotal:candidates.size,
    tests:[...tests.values()].slice(0,10),
    note:'Co-imports are only investigation candidates, NOT proven impacted modules. Event listeners, DI, runtime callbacks, configuration, reflection and indirect calls can be missing from the static graph; inspect source and relevant tests before asserting blast radius.',
  }
}

export async function readImpactContext(root, name) {
  const file=join(root,'graphify-out','graph.json')
  if((await stat(file)).size > MAX_BYTES) return 'Graph context omitted: graph.json exceeds 32 MiB.'
  const raw=JSON.parse(await readFile(file,'utf8'))
  const result=inspectImpactGraph(raw,name)
  const list=(items)=>items.length ? items.map(x => '  - '+JSON.stringify(x)).join('\n') : '  (none)'
  return [
    'Supplemental code graph audit (read-only, not a claim of runtime impact):',
    'Total indexed nodes: '+result.nodes+'; graph relations: '+result.edges,
    result.resolved ? 'Seed: '+JSON.stringify(result.seed) : result.note,
    result.resolved ? 'Direct graph dependents:\n'+list(result.confirmed) : '',
    result.resolved ? 'Co-imported modules for source inspection (NOT confirmed affected; '+result.candidateTotal+' candidate files):\n'+list(result.candidates) : '',
    result.resolved ? 'Potential test entry points:\n'+list(result.tests) : '',
    result.note,
    'Next: inspect actual source event handlers, DI wiring, callbacks and relevant tests; never treat this list as a complete impact report.'
  ].filter(Boolean).join('\n')
}

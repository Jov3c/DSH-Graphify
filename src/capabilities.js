/**
 * Fixed-argv Graphify CLI integration. No free-form command/flag executor.
 * Read-only graph operations work by default; writes / remote side effects
 * require explicitly enabled persistent DSH settings.
 */
import { readFile, stat, realpath } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve, relative, isAbsolute } from 'node:path'

const toolResult = () => ({ schema:{type:'string'}, render:(_args,result)=>[{type:'text',text:result}] })
const text = (value,name,max=500) => {
  if(typeof value!=='string'||!value.trim()||value.length>max)throw Error(name+' must be 1–'+max+' characters')
  return value.trim()
}
const approved=(settings,remote=false)=>{
  if(!settings()?.advancedActions)throw Error('This Graphify operation changes local files or Git state. Enable Advanced actions in Graphify settings first.')
  if(remote&&!settings()?.networkActions)throw Error('This operation may access the network or an LLM. Enable Network and AI operations in Graphify settings first.')
}
async function inside(root,file,{mustExist=false}={}){
  const absolute=resolve(root,text(file,'path',1024))
  const rel=relative(root,absolute)
  if(rel==='..'||rel.startsWith('../')||rel.startsWith('..\\')||isAbsolute(rel))throw Error('Graph file must stay within the DSH project workspace')
  if(mustExist&&!existsSync(absolute))throw Error('Graph file does not exist: '+file)
  if(mustExist){
    const physical=await realpath(absolute)
    const relativePhysical=relative(await realpath(root),physical)
    if(relativePhysical==='..'||relativePhysical.startsWith('../')||relativePhysical.startsWith('..\\')||isAbsolute(relativePhysical))throw Error('Graph file real path escapes the DSH workspace')
    return physical
  }
  return absolute
}
export async function graphStats(root) {
  const file=join(root,'graphify-out','graph.json')
  const info=await stat(file)
  if(info.size>32*1024*1024)throw Error('graph.json exceeds 32 MiB')
  const graph=JSON.parse(await readFile(file,'utf8'))
  const nodes=Array.isArray(graph.nodes)?graph.nodes:[]
  const links=Array.isArray(graph.links)?graph.links:Array.isArray(graph.edges)?graph.edges:[]
  const files=new Set(nodes.map(n=>n.source_file).filter(Boolean))
  const ids=new Set(nodes.map(n=>n.id))
  const degree=new Map()
  for(const e of links){degree.set(e.source,(degree.get(e.source)||0)+1);degree.set(e.target,(degree.get(e.target)||0)+1)}
  const isolated=nodes.filter(n=>!degree.has(n.id)).length
  const missingTargets=links.filter(e=>!ids.has(e.source)||!ids.has(e.target)).length
  const relations={}
  for(const e of links){const key=String(e.relation||e.type||'unknown').slice(0,64);relations[key]=(relations[key]||0)+1}
  return {
    nodes:nodes.length,edges:links.length,indexedFiles:files.size,
    isolatedNodes:isolated,unresolvedEndpoints:missingTargets,
    relationTypes:relations,mtime:info.mtime.toISOString(),
    note:'Indexed file count is NOT source coverage. Full coverage requires comparing the allowed source tree and the parser inventory. Runtime callbacks, DI and dynamic dispatch remain outside static graph guarantees.',
  }
}
const FORMAT={
  tree: ['tree','--output','graphify-out/GRAPH_TREE.html'],
  callflow:['export','callflow-html','--output','graphify-out/GRAPH_CALLFLOW.html'],
  wiki:['export','wiki'],
  obsidian:['export','obsidian'],
  graphml:['export','graphml'],
  html:['export','html'],
}
const produced={
  tree:'graphify-out/GRAPH_TREE.html',callflow:'graphify-out/GRAPH_CALLFLOW.html',
  wiki:'graphify-out/wiki/',obsidian:'graphify-out/obsidian/',
  graphml:'graphify-out/graph.graphml',html:'graphify-out/graph.html',
}
const READONLY={
  multigraph:['diagnose','multigraph','--json'],
  'hook-status':['hook','status'],
  'pr-list':['prs'],
  'pr-conflicts':['prs','--conflicts'],
  'global-list':['global','list'],
}
export function extraToolDescriptors({project,run,settings}) {
  const wrap=fn=>async(args={},exec)=>fn(args,await project(args,exec))
  const output=toolResult()
  return [
    {
      name:'graphify_health',
      description:'Use for natural-language questions about graph completeness, missing relationships, parser issues, isolated nodes and project graph freshness. Local read-only counts, not proof of source coverage.',
      parameters:{directory:{type:'string',description:'Current DSH project directory, optional.'},detail:{type:'string',description:'Optional multigraph diagnostic: "multigraph".'}},
      output,
      execute:wrap(async(args,root)=>{
        const stats=await graphStats(root)
        if(args.detail && args.detail!=='multigraph')throw Error('detail must be multigraph')
        let diagnosis=''
        if(args.detail==='multigraph')diagnosis='\nOfficial graphify diagnose multigraph:\n'+await run(['diagnose','multigraph','--json'],root,{timeoutMs:90000})
        return JSON.stringify(stats,null,2)+diagnosis
      }),
    },
    {
      name:'graphify_view',
      description:'Generate an original Graphify visualization: tree (D3 collapsible hierarchy), callflow (call flow HTML), html (vis-network). Uses existing graph and creates output under graphify-out. The generated tree/callflow files can be opened in an external browser until the DSH panel supports these file types.',
      parameters:{view:{type:'string',required:true,description:'One of tree, callflow, html.'},directory:{type:'string',description:'Project directory, optional.'}},
      output,
      execute:wrap(async(args,root)=>{
        const view=text(args.view,'view',30)
        if(!['tree','callflow','html'].includes(view))throw Error('view must be tree, callflow, or html')
        if(!existsSync(join(root,'graphify-out','graph.json')))throw Error('Build a graph before exporting views')
        const result=await run(FORMAT[view],root,{timeoutMs:180000,maxOutput:10000})
        return result+'\nExpected output: '+produced[view]+'\nOpen the generated tree or callflow file using the Graphify view selector in the DSH sidebar.'
      }),
    },
    {
      name:'graphify_export',
      description:'Export the existing Graphify graph to Wiki, Obsidian vault, GraphML, or native HTML. Local files generated in graphify-out; wiki may require community clustering to be available.',
      parameters:{format:{type:'string',required:true,description:'One of wiki, obsidian, graphml, html.'},directory:{type:'string',description:'Project directory, optional.'}},
      output,
      execute:wrap(async(args,root)=>{
        const format=text(args.format,'format',30)
        if(!['wiki','obsidian','graphml','html'].includes(format))throw Error('Unsupported export format')
        if(!existsSync(join(root,'graphify-out','graph.json')))throw Error('Build a graph before exporting')
        const output=await run(FORMAT[format],root,{timeoutMs:240000})
        return output+'\nOutput folder: graphify-out/'
      }),
    },
    {
      name:'graphify_workflow',
      description:'Read-only Graphify PR dashboard, shared community conflicts, Git hook installation status, global graph list and official multigraph diagnosis. Does not change Git files or call an LLM. PR lookups can contact GitHub and require Network/AI permission.',
      parameters:{operation:{type:'string',required:true,description:'pr-list, pr-conflicts, hook-status, global-list or multigraph.'},directory:{type:'string',description:'Project directory, optional.'}},
      output,
      execute:wrap(async(args,root)=>{
        const operation=text(args.operation,'operation',40)
        const cmd=READONLY[operation]
        if(!cmd)throw Error('Unsupported read-only operation')
        if(operation.startsWith('pr-'))approved(settings,true)
        return await run(cmd,root,{timeoutMs:90000})
      }),
    },
    {
      name:'graphify_memory',
      description:'Explicitly save a useful local graph query result or generate lessons from saved Graphify queries. Requires Advanced actions enabled in DSH settings; never uploads data.',
      parameters:{action:{type:'string',required:true,description:'save or reflect'},question:{type:'string',description:'Question for save'},answer:{type:'string',description:'Answer for save'},directory:{type:'string',description:'Project directory'}},
      output,
      execute:wrap(async(args,root)=>{
        approved(settings)
        const action=text(args.action,'action',20)
        if(action==='reflect')return await run(['reflect','--if-stale'],root,{timeoutMs:120000})
        if(action!=='save')throw Error('Unsupported memory action')
        return await run(['save-result','--question',text(args.question,'question',1200),'--answer',text(args.answer,'answer',4500)],root,{timeoutMs:90000})
      }),
    },
    {
      name:'graphify_git',
      description:'Install or uninstall upstream Graphify repository Git hooks after explicit opt-in in persistent settings; status is always readable via graphify_workflow. Hook install modifies .git/hooks and can run code after Git operations. Never install automatically.',
      parameters:{action:{type:'string',required:true,description:'install or uninstall'},directory:{type:'string',description:'Project directory'}},
      output,
      execute:wrap(async(args,root)=>{
        approved(settings)
        const action=text(args.action,'action',30)
        if(!['install','uninstall'].includes(action))throw Error('action must be install or uninstall')
        return await run(['hook',action],root,{timeoutMs:120000})
      }),
    },
    {
      name:'graphify_merge',
      description:'Explicitly merge two or more Graphify JSON graphs already inside the same authorized workspace. Does not fetch external data. Requires Advanced actions enabled.',
      parameters:{graphs:{type:'array',required:true,description:'Two or more project-relative existing .json paths',items:{type:'string'}},directory:{type:'string',description:'Project directory'}},
      output,
      execute:wrap(async(args,root)=>{
        approved(settings)
        if(!Array.isArray(args.graphs)||args.graphs.length<2||args.graphs.length>12)throw Error('Provide 2–12 graph JSON paths')
        const graphs=await Promise.all(args.graphs.map(x=>inside(root,x,{mustExist:true})))
        if(graphs.some(x=>!x.endsWith('.json')))throw Error('Only .json graph files supported')
        return await run(['merge-graphs',...graphs,'--out','graphify-out/merged-graph.json'],root,{timeoutMs:240000})
      }),
    },
    {
      name:'graphify_add',
      description:'Download a public paper, supported URL or video via original Graphify add. Explicit opt-in required: enable both Advanced actions and Network/AI actions in settings. Never run automatically during routine chat.',
      parameters:{url:{type:'string',required:true,description:'HTTPS URL to import'},directory:{type:'string',description:'Project directory'}},
      output,
      execute:wrap(async(args,root)=>{
        approved(settings,true)
        const url=new URL(text(args.url,'url',1200))
        if(url.protocol!=='https:'||url.username||url.password)throw Error('Only credential-free HTTPS URLs are allowed')
        if(/^(localhost|127\.|0\.0\.0\.0|169\.254\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(url.hostname))throw Error('Local/private addresses are prohibited')
        return await run(['add',url.toString(),'--dir','raw'],root,{timeoutMs:240000})
      }),
    },
    {
      name:'graphify_semantic',
      description:'Explicitly analyze authorized project docs/media using a configured Graphify LLM backend, possibly sending content outside the device and charging API tokens. NEVER run automatically. Requires persistent Advanced and Network/AI permission enabled. This tool may need missing optional Python dependencies.',
      parameters:{backend:{type:'string',required:true,description:'gemini, kimi, claude, openai, deepseek or ollama'},budget:{type:'integer',description:'Maximum Graphify token budget 1000–100000'},directory:{type:'string',description:'Project directory'}},
      output,
      execute:wrap(async(args,root)=>{
        approved(settings,true)
        const backend=text(args.backend,'backend',25)
        if(!['gemini','kimi','claude','openai','deepseek','ollama'].includes(backend))throw Error('Unsupported Graphify backend')
        const budget=args.budget===undefined?8000:args.budget
        if(!Number.isInteger(budget)||budget<1000||budget>100000)throw Error('budget must be 1000–100000 tokens')
        const cmd=['extract','.','--backend',backend,'--token-budget',String(budget)]
        for(const pattern of settings().excludePatterns)cmd.push('--exclude',pattern)
        return await run(cmd,root,{timeoutMs:600000})
      }),
    },
  ]
}

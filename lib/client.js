/* Generated from src/client.js. DO NOT EDIT. */
window.__ModuleLoader__.load({ id: "@jov3c/dsh-graphify", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
/* Standalone CommonJS body embedded in DSH's browser module-table factory.
 * Only React is required at runtime; all DSH services are injected by Cordis.
 */
const React = require('react')
const { createElement: h, useCallback, useEffect, useRef, useState } = React
const PLUGIN_ID = '@jov3c/dsh-graphify'
// Only the original Graphify HTML renderer is used; legacy custom Canvas is removed.
const BUTTON = { cursor: 'pointer', color: 'inherit', background: 'transparent', border: '1px solid #8490a04f', borderRadius: 8, padding: '6px 10px', fontSize: 12 }
const FIELD = { color: 'inherit', minWidth: 0, border: '1px solid #8490a04f', background: 'transparent', borderRadius: 8, padding: '7px 10px', fontSize: 12, width: '100%' }

const GRAPHIFY_DEFAULTS = Object.freeze({
  mode: 'auto',
  agentUsage: 'smart',
  advancedActions: false,
  networkActions: false,
  scope: 'sessions',
  allowlist: [],
  debounceSeconds: 20,
  minIntervalSeconds: 180,
  excludePatterns: ['node_modules/','dist/','build/','coverage/','.env*','secrets/','*.pem','*.key'],
})
function GraphSettings({ form, close }) {
  const [snapshot, setSnapshot] = useState(() => form?.getSnapshot?.() ?? { status: 'unavailable', writable: false })
  const [draft, setDraft] = useState({ ...GRAPHIFY_DEFAULTS, allowlistText:'', excludeText: GRAPHIFY_DEFAULTS.excludePatterns.join('\n') })
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  useEffect(() => {
    if (!form) return undefined
    const read = () => setSnapshot(form.getSnapshot())
    read()
    return form.subscribe(read)
  }, [form])
  useEffect(() => {
    if (snapshot?.status !== 'ready' || dirty) return
    const value = { ...GRAPHIFY_DEFAULTS, ...snapshot.value }
    // Migrate older 1–15s debounce settings to the new, calmer interval.
    if (!Number.isFinite(value.debounceSeconds) || value.debounceSeconds < 5 || value.debounceSeconds > 120) value.debounceSeconds=20
    if (!Number.isFinite(value.minIntervalSeconds) || value.minIntervalSeconds < 30 || value.minIntervalSeconds > 900) value.minIntervalSeconds=180
    setDraft({ ...value,
      allowlistText: Array.isArray(value.allowlist) ? value.allowlist.join('\n') : '',
      excludeText: Array.isArray(value.excludePatterns) ? value.excludePatterns.join('\n') : '',
    })
  }, [snapshot, dirty])
  const change = (key,value) => {
    setDraft(x => ({...x,[key]:value}))
    setDirty(true)
    setNotice('')
  }
  const save = async () => {
    if (!form || saving || !snapshot.writable) return
    const allowlist = draft.allowlistText.split(/\r?\n/).map(x=>x.trim()).filter(Boolean).slice(0,60)
    const excludePatterns = draft.excludeText.split(/\r?\n/).map(x=>x.trim()).filter(x=>x && !x.startsWith('#')).slice(0,60)
    if (draft.scope==='allowlist' && !allowlist.length) {
      setNotice('白名单为空：保存后将不会自动扫描任何项目。')
    }
    if (excludePatterns.some(p=>p.startsWith('!')||p.length>200)) {
      setNotice('排除规则不支持 ! 反向包含，单条不超过 200 字符。')
      return
    }
    setSaving(true)
    try {
      const values={mode:draft.mode,agentUsage:draft.agentUsage,advancedActions:!!draft.advancedActions,networkActions:!!draft.advancedActions&&!!draft.networkActions,scope:draft.scope,allowlist,debounceSeconds:Number(draft.debounceSeconds),minIntervalSeconds:Number(draft.minIntervalSeconds),excludePatterns}
      const ops=Object.entries(values).map(([field,value])=>({op:'set',path:[field],value}))
      const ok=await form.mutate(ops,snapshot.revision)
      if (ok) {setDirty(false);setNotice('设置已保存到 DSH，后续自动任务立即采用新规则。当前运行中的扫描可能先完成。')}
      else setNotice('DSH 拒绝了写入，可能是配置冲突或当前配置只读。请刷新后重试。')
    } catch(err) {setNotice('保存失败：'+String(err?.message??err))}
    finally {setSaving(false)}
  }
  const row={display:'flex',flexDirection:'column',gap:6,marginBottom:12,fontSize:12}
  const lbl={fontWeight:600,fontSize:12}
  const options=(entries)=>entries.map(([value,title])=>h('option',{value,key:value},title))
  return h('section',{role:'region','aria-label':'Graphify 设置',style:{border:'1px solid #8490a04f',borderRadius:12,padding:12,fontSize:12,background:'var(--dsh-background-subtle,rgba(128,128,128,.035))'}},
    h('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}},
      h('strong',{style:{fontSize:14}},'Graphify 设置'),
      h('button',{style:BUTTON,onClick:close},'返回图谱')
    ),
    snapshot?.status!=='ready' ? h('p',{role:'status'},'DSH 配置尚未加载或不可用；设置暂时不可保存。') : null,
    h('label',{style:row},h('span',{style:lbl},'自动触发'),
      h('select',{style:FIELD,value:draft.mode,onChange:e=>change('mode',e.target.value)},
        options([['auto','自动 · 打开项目并持续监听代码变更'],['open','轻量 · 仅打开项目时更新'],['manual','手动 · 仅由 Agent 工具触发'],['off','关闭 · 不启动后台任务']]))),
    h('label',{style:row},h('span',{style:lbl},'Agent 自然语言图谱使用策略'),
      h('select',{style:FIELD,value:draft.agentUsage,onChange:e=>change('agentUsage',e.target.value)},
        options([['smart','智能使用 · 项目相关问题优先使用图谱'],['on-request','仅明确要求 · 用户提到图谱时才使用'],['off','关闭主动使用 · 普通对话不建议调用 Graphify']]))),
    h('p',{style:{opacity:.72,fontSize:11,marginTop:-4}},
      '适用于 DSH Agent 的自然语言提问，不需要输入工具名。自动工具选择依赖模型判断，并非每次强制执行。'),
    h('label',{style:row},h('span',{style:lbl},'允许扫描的工作区'),
      h('select',{style:FIELD,value:draft.scope,onChange:e=>change('scope',e.target.value)},
        options([['sessions','当前打开的本地项目会话'],['allowlist','仅白名单中的项目目录']]))),
    draft.scope==='allowlist'?h('label',{style:row},h('span',{style:lbl},'允许的项目绝对路径（每行一个）'),
      h('textarea',{style:{...FIELD,height:80,resize:'vertical'},value:draft.allowlistText,
        placeholder:'E:\\desk\\feishu-bot',onChange:e=>change('allowlistText',e.target.value)}),
      h('span',{style:{opacity:.65}},'只接受精确匹配的项目根目录；不自动放行它的父目录或其他工作区。')
    ):null,
    h('label',{style:row},h('span',{style:lbl},'停止编辑后的等待时间：'+draft.debounceSeconds+' 秒'),
      h('input',{type:'range',min:5,max:120,step:1,value:draft.debounceSeconds,disabled:draft.mode!=='auto',
        onChange:e=>change('debounceSeconds',Number(e.target.value))})),
    h('label',{style:row},h('span',{style:lbl},'两次自动更新至少间隔：'+draft.minIntervalSeconds+' 秒'),
      h('input',{type:'range',min:30,max:900,step:10,value:draft.minIntervalSeconds,disabled:draft.mode!=='auto',
        onChange:e=>change('minIntervalSeconds',Number(e.target.value))})),
    h('p',{style:{opacity:.68,fontSize:11,marginTop:-4}},
      '默认：停止编辑 20 秒后更新；两次自动更新至少间隔 3 分钟。初次建图不会等待。'),
    h('label',{style:row},h('span',{style:lbl},'自动扫描排除规则（每行一个）'),
      h('textarea',{style:{...FIELD,height:112,resize:'vertical'},value:draft.excludeText,onChange:e=>change('excludeText',e.target.value)}),
      h('span',{style:{opacity:.65}},'采用 Graphify --exclude 规则，此外继续读取项目 .gitignore / .graphifyignore。')
    ),
    h('label',{style:{...row,flexDirection:'row',alignItems:'center',gap:8}},
      h('input',{type:'checkbox',checked:!!draft.advancedActions,onChange:e=>change('advancedActions',e.target.checked)}),
      h('span',{style:{...lbl,flex:1}},'允许高级本地操作（Git Hook、图谱合并、记忆记录）')
    ),
    h('label',{style:{...row,flexDirection:'row',alignItems:'center',gap:8,opacity:draft.advancedActions?1:.55}},
      h('input',{type:'checkbox',checked:!!draft.networkActions,disabled:!draft.advancedActions,onChange:e=>change('networkActions',e.target.checked)}),
      h('span',{style:{...lbl,flex:1}},'允许联网／AI 操作（可上传项目资料并消耗 Token）')
    ),
    h('p',{style:{opacity:.75}},'以上权限默认关闭，须在 DSH 设置中主动开启；普通自动扫描始终只解析本地代码。联网及 AI 操作不会随着代码保存自动启动。'),
    notice?h('p',{role:'status',style:{overflowWrap:'anywhere'}},notice):null,
    h('div',{style:{display:'flex',justifyContent:'flex-end',gap:8}},
      h('button',{style:BUTTON,disabled:!dirty||saving,onClick:()=>{setDirty(false);setNotice('') }},'撤销'),
      h('button',{style:{...BUTTON,fontWeight:650},disabled:!dirty||saving||snapshot?.status!=='ready'||!snapshot.writable,onClick:save},saving?'正在保存…':'保存设置')
    )
  )
}


/**
 * The original Graphify HTML is preserved verbatim except for an additive,
 * restrictive CSP meta tag. It runs in an opaque-origin sandboxed Blob iframe.
 * In particular: never eval project HTML in the DSH/React page itself.
 */
/**
 * Upstream Graphify v8 defaults to dark when storage is unavailable.
 * Our iframe is intentionally opaque-origin (sandbox=allow-scripts), so
 * localStorage is denied. Preserve upstream UI/scripts but choose System as
 * the default and remember manual theme choices in iframe memory.
 * The original matchMedia listener reacts to OS theme changes in System mode.
 */
function systemDefaultGraphTheme(source) {
  const initPattern=/(<script\s+id=["']graphify-theme-init["'][^>]*>)([\s\S]*?)(<\/script>)/i
  const match=source.match(initPattern)
  if(!match)throw Error('Graphify theme initializer not found; regenerate graph.html with the supported Graphify version.')
  let init=match[2]
  const prefix="var pref = null;"
  const storage="pref = localStorage.getItem('graphify-theme');"
  if(!init.includes(prefix)||!init.includes(storage))throw Error('Unsupported Graphify theme initializer')
  init=init.replace(prefix,"var pref = 'system';")
    .replace(storage,"pref = localStorage.getItem('graphify-theme') || 'system';")
  let result=source.replace(initPattern,(_all,start,_body,end)=>start+init+end)

  const themePrefSignature="function themePref() {"
  const returnSignature="return (p === 'light' || p === 'dark' || p === 'system') ? p : null;"
  const clickSignature="const pref = b.dataset.themeChoice;"
  if(!result.includes(themePrefSignature)||!result.includes(returnSignature)||!result.includes(clickSignature)) {
    throw Error('Unsupported Graphify theme selector; cannot guarantee system default')
  }
  result=result.replace(themePrefSignature,
    "let transientThemePreference = 'system';\n"+themePrefSignature)
    .replace(returnSignature,
      "return (p === 'light' || p === 'dark' || p === 'system') ? p : transientThemePreference;")
    .replace(clickSignature,
      clickSignature+"\n    transientThemePreference = pref;")
  return result
}

/**
 * Other upstream views have their own CDNs and must stay inside an
 * opaque-origin script-only iframe. Reject arbitrary project HTML.
 */
function otherOriginalDocument(html, view) {
  if(typeof html !== 'string'||html.length>32*1024*1024)throw Error('Invalid or oversized view HTML')
  const specs={
    tree:{src:'https://d3js.org/d3.v7.min.js',signatures:['d3.hierarchy(', 'd3.tree()']},
    callflow:{src:'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js',signatures:['mermaid.initialize(', 'class="mermaid"']},
  }
  const spec=specs[view]
  if(!spec||!spec.signatures.every(x=>html.includes(x)))throw Error('Unrecognized original Graphify '+view+' HTML')
  const scripts=[...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)]
  if(scripts.length!==1||scripts[0][1]!==spec.src)throw Error('Unexpected external script in '+view+' HTML')
  const csp="default-src 'none'; script-src 'unsafe-inline' "+new URL(spec.src).origin+"; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'"
  if(!/<head(?:\s[^>]*)?>/i.test(html))throw Error('Missing <head> in Graphify view')
  return html.replace(/<head(?:\s[^>]*)?>/i,match=>match+'\n<meta http-equiv="Content-Security-Policy" content="'+csp+'">')
}
function prepareGraphDocument(html,view='network'){
  return view==='network' ? originalGraphDocument(html) : otherOriginalDocument(html,view)
}
function originalGraphDocument(html) {
  if (typeof html !== 'string' || html.length > 32 * 1024 * 1024) throw Error('Invalid or oversized Graphify HTML.')
  const required = [
    '<div id="graph"></div>',
    '<div id="sidebar">',
    'new vis.Network(',
    'unpkg.com/vis-network@9.1.6/standalone/umd/vis-network.min.js',
    'sha384-Ux6phic9PEHJ38YtrijhkzyJ8yQlH8i/+buBR8s3mAZOJrP1gwyvAcIYl3GWtpX1',
  ]
  if (!required.every(part => html.includes(part))) {
    throw Error('The file is not a recognized Graphify v8 graph.html. Please regenerate the original Graphify visualization.')
  }
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)]
  if (scripts.length !== 1 || scripts[0][1] !== 'https://unpkg.com/vis-network@9.1.6/standalone/umd/vis-network.min.js') {
    throw Error('Graphify HTML has an unexpected external script and cannot run in the embedded viewer.')
  }
  const csp = "default-src 'none'; script-src 'unsafe-inline' https://unpkg.com; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'"
  if (!/<head(?:\s[^>]*)?>/i.test(html)) throw Error('Graphify HTML is missing its document head.')
  return systemDefaultGraphTheme(html).replace(/<head(?:\s[^>]*)?>/i, match =>
    match + '\n<meta http-equiv="Content-Security-Policy" content="' + csp + '">'
  )
}
/** Live Graphify iframe is not replaced during background indexing.
 * A new graph revision is announced; the user chooses when to refresh.
 */
function graphRefreshAction(previous, next, previewLoaded, hadStatus) {
  if (!next || next === previous) return 'none'
  if (!previewLoaded) return 'reload'
  if (!previous && !hadStatus) return 'none'
  return 'notify'
}
function sameStatus(previous, next) {
  if (!previous || !next) return previous === next
  return previous.state === next.state
    && previous.detail === next.detail
    && previous.graphRevision === next.graphRevision
    && previous.htmlAvailable === next.htmlAvailable
    && previous.documentsStale === next.documentsStale
    && previous.watching === next.watching
    && previous.viewAttempted === next.viewAttempted
    && previous.htmlError === next.htmlError
}
function viewLoadingLabel(view) {
  return view==='tree' ? '正在加载原版树状图…'
    : view==='callflow' ? '正在加载原版调用流程…'
    : '正在加载原版 Graphify 关系网络…'
}
function viewMissingLabel(view) {
  return view==='tree'
    ? '尚未生成树状图。让 DSH Agent 生成 Graphify tree 视图（graphify_view，view=tree），再点击刷新。'
    : view==='callflow'
    ? '尚未生成调用流程图。让 DSH Agent 生成 Graphify callflow 视图（graphify_view，view=callflow），再点击刷新。'
    : '尚未生成 graphify-out/graph.html。等待自动索引完成；若状态已就绪，让 Agent 运行 graphify_view（view=html），或点击刷新重试。'
}
function OriginalGraphPreview({ loadHtml, view='network', revision, enabled, onLoadError, onLoadComplete }) {
  const [frameUrl, setFrameUrl] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  // A hidden sidebar is not an instruction to discard iframe state.
  // Load lazily at first visibility, then keep the live frame mounted.
  const [activated, setActivated] = useState(!!enabled)
  useEffect(() => { if (enabled) setActivated(true) }, [enabled])
  useEffect(() => {
    if (!activated) return undefined
    const controller = new AbortController()
    let objectUrl
    setLoading(true)
    setError('')
    setFrameUrl('')
    Promise.resolve().then(() => loadHtml(controller.signal)).then(bytes => {
      if (controller.signal.aborted) return
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      const source = prepareGraphDocument(text,view)
      objectUrl = URL.createObjectURL(new Blob([source], { type: 'text/html;charset=utf-8' }))
      setFrameUrl(objectUrl)
      setLoading(false)
      onLoadComplete?.()
    }).catch(err => {
      if (controller.signal.aborted) return
      setFrameUrl('')
      const message = err?.code === 'workspace-file/not-found'
        ? viewMissingLabel(view)
        : String(err?.message || err)
      setError(message)
      setLoading(false)
      onLoadError?.(message)
    })
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [loadHtml, revision, activated, view])
  return h('div', { style: { display: 'flex', flex: 1, minHeight: 260, flexDirection: 'column' } },
    loading && activated ? h('p', { role: 'status', style: { fontSize: 12, opacity: .8 } }, viewLoadingLabel(view)) : null,
    error ? h('p', { role: 'status', style: { fontSize: 12, padding: 10, opacity: .8, overflowWrap: 'anywhere' } }, error) : null,
    frameUrl && !error ? h('iframe', {
      key: frameUrl,
      title: 'Graphify · ' + (view === 'tree' ? '树状图' : view === 'callflow' ? '调用流程' : '关系网络'),
      sandbox: 'allow-scripts',
      referrerPolicy: 'no-referrer',
      src: frameUrl,
      style: { width: '100%', height: '100%', minHeight: 320, flex: 1, border: '1px solid #8490a035', borderRadius: 9, background: 'transparent' },
    }) : null,
    frameUrl ? h('div', { style: { opacity: .6, fontSize: 10, paddingTop: 4 } },
      '原版 Graphify · ' + (view === 'tree' ? 'D3 树状图' : view === 'callflow' ? 'Mermaid 调用流程' : 'vis-network 关系网络') + ' · 沙箱隔离。交互图形库需联网加载。'
    ) : null,
  )
}
function GraphPanel(props) {
  const { tab } = props.useTabInfo()
  const [showSettings, setShowSettings] = useState(false)
  const [view,setView]=useState('network')
  const [autoStatus, setAutoStatus] = useState(null)
  const [refresh, setRefresh] = useState({network:0,tree:0,callflow:0})
  const [pendingRevision,setPendingRevision] = useState(null)
  const lastSeenRevision=useRef(null)
  const statusSeen=useRef(false)
  const statusFailures=useRef(0)
  const previewLoaded=useRef(false)
  // Each view owns its iframe and refresh revision; navigating away from a
  // view does not destroy the current zoom/filter/expansion state.
  const refreshView=useCallback(target=>{
    if (target === 'network') {
      previewLoaded.current=false
      setPendingRevision(null)
    }
    setRefresh(current=>({...current,[target]:current[target]+1}))
  },[])
  const reload=useCallback(()=>refreshView(view),[refreshView,view])
  const onLoadComplete=useCallback(()=>{previewLoaded.current=true},[])
  useEffect(() => tab.actions.bindCommands({ refresh: reload }), [tab.actions, reload])
  useEffect(() => {
    if (!tab.visible || tab.signal.aborted) return undefined
    let active = true
    let inFlight = false
    const controller = new AbortController()
    const probe = async () => {
      if (!active || inFlight) return
      inFlight = true
      try {
        const bytes = await props.loadStatus(controller.signal)
        const value = JSON.parse(new TextDecoder().decode(bytes))
        if (!active || !['ready','building','updating','error','paused'].includes(value?.state)) return
        statusFailures.current=0
        setAutoStatus(previous => sameStatus(previous, value) ? previous : value)
        if (value.state === 'ready' && value.graphRevision) {
          const action=graphRefreshAction(lastSeenRevision.current,value.graphRevision,previewLoaded.current,statusSeen.current)
          lastSeenRevision.current=value.graphRevision
          if(action==='reload')refreshView('network')
          else if(action==='notify')setPendingRevision(value.graphRevision)
        }
        statusSeen.current=true
      } catch (_error) {
        // Atomic status writes should make this rare. Keep the last good
        // status through a transient read, and only clear it after repeated
        // failures so the panel never flashes empty.
        statusFailures.current += 1
        if (active && statusFailures.current >= 4) setAutoStatus(null)
      }
      finally { inFlight = false }
    }
    void probe()
    const timer = setInterval(() => { void probe() }, 2500)
    return () => { active = false; clearInterval(timer); controller.abort() }
  }, [props.loadStatus, tab.visible, tab.signal, refreshView])
  return h('section', { style: { height: '100%', minHeight: 240, display: 'flex', flexDirection: 'column', padding: 8, gap: 8, color: 'inherit', fontFamily: 'system-ui,sans-serif', boxSizing: 'border-box' }, 'data-dsh-graphify': 'original' },
    h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 } },
      h('strong', { style: { fontSize: 14 } }, 'Graphify · Original'),
      h('select',{style:{...FIELD,width:'auto',maxWidth:145,padding:'5px 7px'},'aria-label':'Graphify 视图',value:view,onChange:e=>setView(e.target.value)},
        ['network','tree','callflow'].map(x=>h('option',{key:x,value:x},x==='network'?'关系网络':x==='tree'?'树状图':'调用流程'))),
      h('div', { style: { display: 'flex', gap: 6 } },
        h('button', { style: BUTTON, onClick: reload }, '↻ 刷新'),
        h('button', { style: BUTTON, 'aria-label': 'Graphify 设置', onClick: () => setShowSettings(x => !x) }, showSettings ? '返回图谱' : '⚙ 设置')
      )
    ),
    h('div', { style: { height: 34, minHeight: 34, flexShrink: 0, display: 'flex', alignItems: 'stretch' } },
      autoStatus ? h('div', { role: 'status', title: autoStatus.detail || '', style: { flex: 1, fontSize: 12, height: 34, lineHeight: '34px', padding: '0 10px', background: 'rgba(128,128,128,.09)', borderRadius: 8, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', boxSizing: 'border-box' } },
        autoStatus.state === 'building' ? '● 正在生成代码图谱… ' :
        autoStatus.state === 'updating' ? '● 正在更新图谱… ' :
        autoStatus.state === 'ready'
          ? (autoStatus.htmlAvailable === false ? '⚠ 代码图谱已就绪，但关系网络视图未生成。 ' : '✓ 图谱已就绪。 ')
          : autoStatus.state === 'paused' ? 'Ⅱ 自动扫描已暂停。 ' : '⚠ 图谱构建失败：',
        autoStatus.detail || ''
      ) : null
    ),
    showSettings ? h(GraphSettings,{form:props.settingsForm,close:()=>setShowSettings(false)}):null,
    h('div',{style:{position:'relative',display:showSettings?'none':'flex',flex:1,minHeight:0,flexDirection:'column'}},
      pendingRevision && !showSettings ? h('div',{role:'status',style:{position:'absolute',zIndex:2,top:8,left:8,right:8,display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',fontSize:12,padding:'8px 10px',background:'rgba(128,128,128,.24)',border:'1px solid rgba(128,128,128,.35)',borderRadius:8,backdropFilter:'blur(8px)',boxShadow:'0 4px 12px rgba(0,0,0,.12)'}},
        h('span',{},'图谱已更新；为保留当前缩放、节点选择和筛选，没有自动刷新画面。'),
        h('button',{style:BUTTON,onClick:()=>{setView('network');refreshView('network')}},'加载最新图谱'),
        h('button',{style:BUTTON,onClick:()=>setPendingRevision(null)},'稍后')
      ):null,
      h('div',{key:'network',style:{display:view==='network'?'flex':'none',flex:1,minHeight:0,flexDirection:'column'}},
        h(OriginalGraphPreview,{loadHtml:props.loadHtml,view:'network',enabled:tab.visible&&view==='network',revision:refresh.network,onLoadComplete})
      ),
      h('div',{key:'tree',style:{display:view==='tree'?'flex':'none',flex:1,minHeight:0,flexDirection:'column'}},
        h(OriginalGraphPreview,{loadHtml:props.loadTree,view:'tree',enabled:tab.visible&&view==='tree',revision:refresh.tree})
      ),
      h('div',{key:'callflow',style:{display:view==='callflow'?'flex':'none',flex:1,minHeight:0,flexDirection:'column'}},
        h(OriginalGraphPreview,{loadHtml:props.loadCallflow,view:'callflow',enabled:tab.visible&&view==='callflow',revision:refresh.callflow})
      )
    ),
  )
}

exports.inject = ['slots', 'sidebarRightTabs', 'remote', 'remote.workspaceFiles', 'configForms']
exports.apply = function apply(ctx) {
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: PLUGIN_ID, kind: 'graphify', priority: 'extension', title: () => 'Graphify',
    keepMounted: true,
    guide: [{ id: 'graphify.open', order: 80, title: () => 'Graphify', description: () => 'Interactive code knowledge graph' }],
  }), 'dsh-graphify:tab-definition')
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab', key: PLUGIN_ID,
    inject: sessionId => ({
      settingsForm: ctx.configForms.get('dsh-graphify'),
      loadHtml: async signal => {
        const result = await ctx.remote.workspaceFiles.readBytes(sessionId, 'graphify-out/graph.html', {}, signal)
        if (!result.ok) throw result.error
        return result.value.data
      },
      loadTree: async signal => {
        const r=await ctx.remote.workspaceFiles.readBytes(sessionId,'graphify-out/GRAPH_TREE.html',{},signal)
        if(!r.ok)throw r.error
        return r.value.data
      },
      loadCallflow: async signal => {
        const r=await ctx.remote.workspaceFiles.readBytes(sessionId,'graphify-out/GRAPH_CALLFLOW.html',{},signal)
        if(!r.ok)throw r.error
        return r.value.data
      },
      loadGraph: async signal => {
        const result = await ctx.remote.workspaceFiles.readBytes(sessionId, 'graphify-out/graph.json', {}, signal)
        if (!result.ok) {
          if (result.error?.code === 'workspace-file/not-found') {
            throw new Error('No graph generated yet. Automatic local indexing starts with an active project session.')
          }
          throw result.error
        }
        return result.value.data
      },
      loadStatus: async signal => {
        const result = await ctx.remote.workspaceFiles.readBytes(sessionId, 'graphify-out/.dsh-graphify-status.json', {}, signal)
        if (!result.ok) throw result.error
        return result.value.data
      },
    }),
  }, GraphPanel)), 'dsh-graphify:tab-body')
}
exports.__test = { originalGraphDocument, otherOriginalDocument, prepareGraphDocument, systemDefaultGraphTheme, graphRefreshAction, viewMissingLabel, viewLoadingLabel }

return module.exports; } });

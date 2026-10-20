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
      const values={mode:draft.mode,agentUsage:draft.agentUsage,scope:draft.scope,allowlist,debounceSeconds:Number(draft.debounceSeconds),minIntervalSeconds:Number(draft.minIntervalSeconds),excludePatterns}
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
    h('p',{style:{opacity:.75}},'AI 语义分析：保持关闭。自动扫描只解析本地代码，不调用模型、不产生 AI Token；高级语义分析需另行明确触发。'),
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
  return html.replace(/<head(?:\s[^>]*)?>/i, match =>
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
function OriginalGraphPreview({ loadHtml, revision, enabled, onLoadError, onLoadComplete }) {
  const [frameUrl, setFrameUrl] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!enabled) return undefined
    const controller = new AbortController()
    let objectUrl
    setLoading(true)
    setError('')
    setFrameUrl('')
    Promise.resolve().then(() => loadHtml(controller.signal)).then(bytes => {
      if (controller.signal.aborted) return
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      const source = originalGraphDocument(text)
      objectUrl = URL.createObjectURL(new Blob([source], { type: 'text/html;charset=utf-8' }))
      setFrameUrl(objectUrl)
      setLoading(false)
      onLoadComplete?.()
    }).catch(err => {
      if (controller.signal.aborted) return
      setFrameUrl('')
      const message = err?.code === 'workspace-file/not-found'
        ? 'Waiting for Graphify to generate graphify-out/graph.html…'
        : String(err?.message || err)
      setError(message)
      setLoading(false)
      onLoadError?.(message)
    })
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [loadHtml, revision, enabled])
  return h('div', { style: { display: 'flex', flex: 1, minHeight: 260, flexDirection: 'column' } },
    loading ? h('p', { role: 'status', style: { fontSize: 12, opacity: .8 } }, 'Loading the original Graphify graph.html…') : null,
    error ? h('p', { role: 'status', style: { fontSize: 12, padding: 10, opacity: .8, overflowWrap: 'anywhere' } }, error) : null,
    frameUrl && !error ? h('iframe', {
      key: frameUrl,
      title: 'Graphify original interactive visualization',
      sandbox: 'allow-scripts',
      referrerPolicy: 'no-referrer',
      src: frameUrl,
      style: { width: '100%', height: '100%', minHeight: 320, flex: 1, border: '1px solid #8490a035', borderRadius: 9, background: '#10151c' },
    }) : null,
    frameUrl ? h('div', { style: { opacity: .6, fontSize: 10, paddingTop: 4 } },
      'Original Graphify · vis-network 9.1.6 · isolated iframe · vis library loads from unpkg.com.'
    ) : null,
  )
}
function GraphPanel(props) {
  const { tab } = props.useTabInfo()
  const [showSettings, setShowSettings] = useState(false)
  const [autoStatus, setAutoStatus] = useState(null)
  const [refresh, setRefresh] = useState(0)
  const [pendingRevision,setPendingRevision] = useState(null)
  const lastSeenRevision=useRef(null)
  const statusSeen=useRef(false)
  const previewLoaded=useRef(false)
  const reload=useCallback(()=>{
    previewLoaded.current=false
    setPendingRevision(null)
    setRefresh(n=>n+1)
  },[])
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
        setAutoStatus(value)
        if (value.state === 'ready' && value.graphRevision) {
          const action=graphRefreshAction(lastSeenRevision.current,value.graphRevision,previewLoaded.current,statusSeen.current)
          lastSeenRevision.current=value.graphRevision
          if(action==='reload')reload()
          else if(action==='notify')setPendingRevision(value.graphRevision)
        }
        statusSeen.current=true
      } catch (_error) { if (active) setAutoStatus(null) }
      finally { inFlight = false }
    }
    void probe()
    const timer = setInterval(() => { void probe() }, 2500)
    return () => { active = false; clearInterval(timer); controller.abort() }
  }, [props.loadStatus, tab.visible, tab.signal, reload])
  return h('section', { style: { height: '100%', minHeight: 240, display: 'flex', flexDirection: 'column', padding: 8, gap: 8, color: 'inherit', fontFamily: 'system-ui,sans-serif', boxSizing: 'border-box' }, 'data-dsh-graphify': 'original' },
    h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 } },
      h('strong', { style: { fontSize: 14 } }, 'Graphify · Original'),
      h('div', { style: { display: 'flex', gap: 6 } },
        h('button', { style: BUTTON, onClick: reload }, '↻ Refresh'),
        h('button', { style: BUTTON, 'aria-label': 'Graphify 设置', onClick: () => setShowSettings(x => !x) }, showSettings ? '返回图谱' : '⚙ 设置')
      )
    ),
    autoStatus ? h('div', { role: 'status', style: { fontSize: 12, padding: '7px 10px', background: 'rgba(128,128,128,.09)', borderRadius: 8, overflowWrap: 'anywhere' } },
      autoStatus.state === 'building' ? '● 正在生成代码图谱… ' :
      autoStatus.state === 'updating' ? '● 正在更新图谱… ' :
      autoStatus.state === 'ready' ? '✓ 图谱已就绪。 ' :
      autoStatus.state === 'paused' ? 'Ⅱ 自动扫描已暂停。 ' : '⚠ 图谱构建失败：',
      autoStatus.detail || ''
    ) : null,
    pendingRevision && !showSettings ? h('div',{role:'status',style:{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',fontSize:12,padding:'8px 10px',background:'rgba(128,128,128,.10)',borderRadius:8}},
      h('span',{},'图谱已更新；为保留当前缩放、节点选择和筛选，没有自动刷新画面。'),
      h('button',{style:BUTTON,onClick:reload},'加载最新图谱')
    ):null,
    showSettings ? h(GraphSettings,{form:props.settingsForm,close:()=>setShowSettings(false)}):null,
    h('div',{style:{display:showSettings?'none':'flex',flex:1,minHeight:0,flexDirection:'column'}},
      h(OriginalGraphPreview,{loadHtml:props.loadHtml,enabled:tab.visible,revision:refresh,onLoadComplete})
    ),
  )
}

exports.inject = ['slots', 'sidebarRightTabs', 'remote', 'remote.workspaceFiles', 'configForms']
exports.apply = function apply(ctx) {
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: PLUGIN_ID, kind: 'graphify', priority: 'extension', title: () => 'Graphify',
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
exports.__test = { originalGraphDocument, graphRefreshAction }

return module.exports; } });

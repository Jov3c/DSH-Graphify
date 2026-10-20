/* Standalone CommonJS body embedded in DSH's browser module-table factory.
 * Only React is required at runtime; all DSH services are injected by Cordis.
 */
const React = require('react')
const { createElement: h, useCallback, useEffect, useMemo, useRef, useState } = React
const PLUGIN_ID = '@jov3c/dsh-graphify'
const PALETTE = ['#5688c2', '#bf7a55', '#63a68a', '#9d83be', '#cca755', '#c06e8c', '#6a9db0', '#9a9a64', '#be7866', '#7894b6']
const MAX_NODES = 800
const MAX_EDGES = 4500

function nodeId(value) {
  if (value && typeof value === 'object') return String(value.id ?? value.name ?? '')
  return String(value ?? '')
}
function normaliseGraph(input) {
  if (!input || typeof input !== 'object') throw Error('graph.json is not an object')
  const body = Array.isArray(input.nodes) ? input : (input.graph && Array.isArray(input.graph.nodes) ? input.graph : input)
  const allNodes = Array.isArray(body.nodes) ? body.nodes : []
  const allLinks = Array.isArray(body.links) ? body.links : (Array.isArray(body.edges) ? body.edges : [])
  if (!allNodes.length) throw Error('No nodes found in graph.json. Rebuild with graphify .')
  const nodes = []
  const keys = new Set()
  for (let i = 0; i < allNodes.length && nodes.length < MAX_NODES; i++) {
    const row = allNodes[i]
    const id = nodeId(row?.id ?? row?.name ?? i)
    if (keys.has(id)) continue
    keys.add(id)
    const props = row && typeof row === 'object' ? row : {}
    const data = props.data && typeof props.data === 'object' ? props.data : {}
    nodes.push({
      id,
      label: String(props.label ?? props.name ?? data.label ?? id).slice(0, 100),
      community: String(props.community ?? props.community_id ?? data.community ?? 'Unassigned'),
      source: String(props.source_file ?? props.file ?? data.source_file ?? '').slice(0, 500),
      line: String(props.source_location ?? data.source_location ?? '').slice(0, 60),
      kind: String(props.type ?? props.kind ?? data.type ?? '').slice(0, 80),
    })
  }
  const links = []
  for (const row of allLinks) {
    if (links.length >= MAX_EDGES) break
    const a = nodeId(row?.source ?? row?.from)
    const b = nodeId(row?.target ?? row?.to)
    if (!keys.has(a) || !keys.has(b) || a === b) continue
    links.push({ source: a, target: b, relation: String(row?.relation ?? row?.label ?? '').slice(0, 80) })
  }
  return { nodes, links, totalNodes: allNodes.length, totalLinks: allLinks.length }
}
function layoutGraph(graph) {
  const groups = new Map()
  for (const node of graph.nodes) {
    if (!groups.has(node.community)) groups.set(node.community, [])
    groups.get(node.community).push(node)
  }
  const groupRows = [...groups].sort((a, b) => b[1].length - a[1].length)
  const centers = new Map()
  const count = groupRows.length
  for (let i = 0; i < count; i++) {
    const theta = i * Math.PI * (3 - Math.sqrt(5))
    const distance = Math.sqrt(i) * 250
    centers.set(groupRows[i][0], { x: Math.cos(theta) * distance, y: Math.sin(theta) * distance })
  }
  const positions = new Map()
  for (let gi = 0; gi < groupRows.length; gi++) {
    const [community, nodes] = groupRows[gi]
    const center = centers.get(community)
    nodes.forEach((node, index) => {
      const ring = Math.floor(Math.sqrt(index))
      const start = ring * ring
      const inRing = Math.max(1, 2 * ring + 1)
      const angle = (index - start) / inRing * Math.PI * 2 + (gi * 1.7)
      const distance = index === 0 ? 0 : 28 + ring * 22
      positions.set(node.id, { x: center.x + Math.cos(angle) * distance, y: center.y + Math.sin(angle) * distance })
    })
  }
  return positions
}
function shortestPath(graph, from, to) {
  if (!from || !to || from === to) return from && from === to ? [from] : []
  const neighbors = new Map(graph.nodes.map(x => [x.id, []]))
  graph.links.forEach(x => { neighbors.get(x.source)?.push(x.target); neighbors.get(x.target)?.push(x.source) })
  const queue = [from]
  const parent = new Map([[from, null]])
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i]
    for (const next of neighbors.get(id) || []) {
      if (parent.has(next)) continue
      parent.set(next, id)
      if (next === to) {
        const result = [to]
        while (parent.get(result[0]) !== null) result.unshift(parent.get(result[0]))
        return result
      }
      queue.push(next)
    }
  }
  return []
}
function useCanvasSize(ref) {
  const [size, setSize] = useState({ width: 800, height: 600 })
  useEffect(() => {
    if (!ref.current) return undefined
    const resize = () => setSize({ width: Math.max(240, ref.current.clientWidth), height: Math.max(200, ref.current.clientHeight) })
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [ref])
  return size
}
function pill(text, style) { return h('span', { style: { border: '1px solid #737c8a4b', borderRadius: 30, padding: '3px 9px', fontSize: 11, color: 'var(--dsh-text-secondary, #9ca3af)', ...style } }, text) }
const BUTTON = { cursor: 'pointer', color: 'inherit', background: 'transparent', border: '1px solid #8490a04f', borderRadius: 8, padding: '6px 10px', fontSize: 12 }
const FIELD = { color: 'inherit', minWidth: 0, border: '1px solid #8490a04f', background: 'transparent', borderRadius: 8, padding: '7px 10px', fontSize: 12, width: '100%' }

function GraphCanvas({ graph, selected, onSelect, filterCommunity, highlightedPath, viewport, setViewport }) {
  const containerRef = useRef(null)
  const canvasRef = useRef(null)
  const pointerRef = useRef(null)
  const size = useCanvasSize(containerRef)
  const positions = useMemo(() => layoutGraph(graph), [graph])
  const activeNodes = useMemo(() => graph.nodes.filter(n => !filterCommunity || n.community === filterCommunity), [graph, filterCommunity])
  const visible = useMemo(() => new Set(activeNodes.map(n => n.id)), [activeNodes])
  const edges = useMemo(() => graph.links.filter(e => visible.has(e.source) && visible.has(e.target)), [graph, visible])
  const pathEdges = useMemo(() => {
    const s = new Set()
    for (let i = 1; i < highlightedPath.length; i++) {
      const a = highlightedPath[i - 1], b = highlightedPath[i]
      s.add(`${a}\u0000${b}`); s.add(`${b}\u0000${a}`)
    }
    return s
  }, [highlightedPath])
  const neighbors = useMemo(() => {
    const set = new Set(selected ? [selected] : [])
    if (selected) edges.forEach(e => { if (e.source === selected) set.add(e.target); if (e.target === selected) set.add(e.source) })
    return set
  }, [selected, edges])
  const toScreen = useCallback(p => ({ x: size.width / 2 + (p.x - viewport.x) * viewport.zoom, y: size.height / 2 + (p.y - viewport.y) * viewport.zoom }), [size, viewport])
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.ceil(size.width * dpr)
    canvas.height = Math.ceil(size.height * dpr)
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size.width, size.height)
    const light = window.matchMedia?.('(prefers-color-scheme: light)').matches
    const foreground = light ? '#40536b' : '#e0e6ed'
    const muted = light ? 'rgba(65,90,123,.17)' : 'rgba(178,194,213,.16)'
    for (const edge of edges) {
      const a = toScreen(positions.get(edge.source)), b = toScreen(positions.get(edge.target))
      const active = pathEdges.has(`${edge.source}\u0000${edge.target}`)
      const adjacent = selected && (edge.source === selected || edge.target === selected)
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y)
      ctx.strokeStyle = active ? '#f5ba68' : adjacent ? 'rgba(100,178,220,.75)' : muted
      ctx.lineWidth = active ? 3 : adjacent ? 1.7 : 0.8
      ctx.stroke()
    }
    for (const node of activeNodes) {
      const p = toScreen(positions.get(node.id))
      if (p.x < -100 || p.x > size.width + 100 || p.y < -100 || p.y > size.height + 100) continue
      const idx = [...new Set(graph.nodes.map(n => n.community))].indexOf(node.community)
      const color = PALETTE[Math.max(0, idx) % PALETTE.length]
      const active = selected === node.id
      const dim = selected && !neighbors.has(node.id) && !highlightedPath.includes(node.id)
      const radius = active ? 8.8 : highlightedPath.includes(node.id) ? 7.2 : 4.4
      ctx.globalAlpha = dim ? 0.3 : 1
      ctx.beginPath(); ctx.arc(p.x, p.y, radius * Math.min(2, Math.max(.6, viewport.zoom)), 0, Math.PI * 2)
      ctx.fillStyle = color; ctx.fill()
      if (active) { ctx.strokeStyle = foreground; ctx.lineWidth = 2; ctx.stroke() }
      if ((active || highlightedPath.includes(node.id) || (viewport.zoom > 1.65 && node.label.length < 40)) && activeNodes.length <= 800) {
        ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = foreground
        ctx.fillText(node.label.slice(0, 36), p.x + 12, p.y - 8)
      }
    }
    ctx.globalAlpha = 1
  }, [size, positions, graph, activeNodes, edges, viewport, toScreen, selected, highlightedPath, pathEdges, neighbors])
  const hitTest = e => {
    const box = canvasRef.current.getBoundingClientRect()
    const x = e.clientX - box.left, y = e.clientY - box.top
    let best = null, radius = Math.max(10, 12 * viewport.zoom)
    for (const n of activeNodes) {
      const p = toScreen(positions.get(n.id))
      const delta = Math.hypot(x - p.x, y - p.y)
      if (delta < radius) { radius = delta; best = n.id }
    }
    return best
  }
  const move = e => {
    const pointer = pointerRef.current
    if (!pointer || e.pointerId !== pointer.id) return
    const dx = e.clientX - pointer.x, dy = e.clientY - pointer.y
    if (Math.abs(dx) + Math.abs(dy) > 2) pointer.dragged = true
    pointer.x = e.clientX; pointer.y = e.clientY
    if (pointer.dragged) setViewport(prev => ({ ...prev, x: prev.x - dx / prev.zoom, y: prev.y - dy / prev.zoom }))
  }
  const end = e => {
    const old = pointerRef.current
    pointerRef.current = null
    if (old && old.id === e.pointerId && !old.dragged) onSelect(hitTest(e))
    e.currentTarget.releasePointerCapture?.(e.pointerId)
  }
  return h('div', { ref: containerRef, style: { position: 'relative', flex: 1, minHeight: 180, overflow: 'hidden', borderRadius: 12, border: '1px solid #808b9c3b', background: 'var(--dsh-background-subtle, rgba(104,118,142,.055))' } },
    h('canvas', { ref: canvasRef, style: { width: '100%', height: '100%', cursor: 'grab', touchAction: 'none', display: 'block' },
      onPointerDown: e => { pointerRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY, dragged: false }; e.currentTarget.setPointerCapture(e.pointerId) },
      onPointerMove: move, onPointerUp: end, onPointerCancel: () => { pointerRef.current = null },
      onWheel: e => { e.preventDefault(); const scale = Math.exp(-e.deltaY * .0015); setViewport(prev => ({ ...prev, zoom: Math.min(4.5, Math.max(.12, prev.zoom * scale)) })) },
    }),
    h('span', { style: { position: 'absolute', bottom: 8, left: 10, fontSize: 11, opacity: .6, pointerEvents: 'none' } }, 'Drag · Scroll to zoom · Click node'),
    h('div', { style: { position: 'absolute', right: 8, top: 8, display: 'flex', gap: 5 } },
      h('button', { style: BUTTON, title: 'Zoom in', onClick: () => setViewport(v => ({ ...v, zoom: Math.min(4.5, v.zoom * 1.25) })) }, '+'),
      h('button', { style: BUTTON, title: 'Zoom out', onClick: () => setViewport(v => ({ ...v, zoom: Math.max(.12, v.zoom / 1.25) })) }, '−'),
      h('button', { style: BUTTON, title: 'Reset view', onClick: () => setViewport({ x: 0, y: 0, zoom: 0.65 }) }, '⤢'),
    ),
  )
}

const GRAPHIFY_DEFAULTS = Object.freeze({
  mode: 'auto',
  scope: 'sessions',
  allowlist: [],
  debounceSeconds: 3,
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
      const values={mode:draft.mode,scope:draft.scope,allowlist,debounceSeconds:Number(draft.debounceSeconds),excludePatterns}
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
    h('label',{style:row},h('span',{style:lbl},'允许扫描的工作区'),
      h('select',{style:FIELD,value:draft.scope,onChange:e=>change('scope',e.target.value)},
        options([['sessions','当前打开的本地项目会话'],['allowlist','仅白名单中的项目目录']]))),
    draft.scope==='allowlist'?h('label',{style:row},h('span',{style:lbl},'允许的项目绝对路径（每行一个）'),
      h('textarea',{style:{...FIELD,height:80,resize:'vertical'},value:draft.allowlistText,
        placeholder:'E:\\desk\\feishu-bot',onChange:e=>change('allowlistText',e.target.value)}),
      h('span',{style:{opacity:.65}},'只接受精确匹配的项目根目录；不自动放行它的父目录或其他工作区。')
    ):null,
    h('label',{style:row},h('span',{style:lbl},'文件保存后等待时间：'+draft.debounceSeconds+' 秒'),
      h('input',{type:'range',min:1,max:15,step:1,value:draft.debounceSeconds,disabled:draft.mode!=='auto',
        onChange:e=>change('debounceSeconds',Number(e.target.value))})),
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
function OriginalGraphPreview({ loadHtml, revision, enabled, onLoadError }) {
  const [frameUrl, setFrameUrl] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!enabled) return undefined
    const controller = new AbortController()
    let objectUrl
    setLoading(true)
    setError('')
    Promise.resolve().then(() => loadHtml(controller.signal)).then(bytes => {
      if (controller.signal.aborted) return
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      const source = originalGraphDocument(text)
      objectUrl = URL.createObjectURL(new Blob([source], { type: 'text/html;charset=utf-8' }))
      setFrameUrl(objectUrl)
      setLoading(false)
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
  const [graphCount, setGraphCount] = useState('')
  const lastReady = useRef(null)
  const reload = useCallback(() => setRefresh(n => n + 1), [])
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
        if (value.state === 'ready' && value.updatedAt !== lastReady.current) {
          lastReady.current = value.updatedAt
          reload()
        }
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
    showSettings
      ? h(GraphSettings, { form: props.settingsForm, close: () => setShowSettings(false) })
      : h(OriginalGraphPreview, { loadHtml: props.loadHtml, enabled: tab.visible, revision: refresh }),
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
exports.__test = { normaliseGraph, layoutGraph, shortestPath, originalGraphDocument }

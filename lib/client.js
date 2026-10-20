/* Generated from src/client.js. DO NOT EDIT. */
window.__ModuleLoader__.load({ id: "@jov3c/dsh-graphify", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
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
function GraphPanel(props) {
  const { tab } = props.useTabInfo()
  const [status, setStatus] = useState({ loading: true, graph: null, error: '' })
  const [refresh, setRefresh] = useState(0)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [pathTarget, setPathTarget] = useState('')
  const [community, setCommunity] = useState('')
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 0.65 })
  const reload = useCallback(() => setRefresh(c => c + 1), [])
  useEffect(() => {
    if (!tab.visible || tab.signal.aborted) return undefined
    const controller = new AbortController()
    const abort = () => controller.abort()
    tab.signal.addEventListener('abort', abort, { once: true })
    setStatus(s => ({ ...s, loading: true, error: '' }))
    props.loadGraph(controller.signal).then(data => {
      if (controller.signal.aborted) return
      const text = new TextDecoder('utf-8', { fatal: true }).decode(data)
      const graph = normaliseGraph(JSON.parse(text))
      setStatus({ loading: false, graph, error: '' })
    }).catch(err => {
      if (!controller.signal.aborted) setStatus({ loading: false, graph: null, error: err instanceof Error ? err.message : String(err) })
    })
    return () => { controller.abort(); tab.signal.removeEventListener('abort', abort) }
  }, [refresh, props.loadGraph, tab.visible, tab.signal])
  useEffect(() => tab.actions.bindCommands({ refresh: reload }), [tab.actions, reload])
  const graph = status.graph
  const groups = useMemo(() => graph ? [...new Set(graph.nodes.map(n => n.community))] : [], [graph])
  const matches = useMemo(() => graph && search.trim() ? graph.nodes.filter(n => (n.label + ' ' + n.id + ' ' + n.source).toLowerCase().includes(search.toLowerCase())).slice(0, 15) : [], [search, graph])
  const current = graph?.nodes.find(n => n.id === selected)
  const path = useMemo(() => graph && selected && pathTarget ? shortestPath(graph, selected, pathTarget) : [], [graph, selected, pathTarget])
  const focus = n => { setSelected(n.id); setCommunity(''); const pos = layoutGraph(graph).get(n.id); if (pos) setViewport(s => ({ ...s, x: pos.x, y: pos.y, zoom: Math.max(.95, s.zoom) })) }
  const countText = graph ? `${graph.totalNodes} nodes · ${graph.totalLinks} links` : 'No graph loaded'
  return h('section', { style: { height: '100%', minHeight: 200, display: 'flex', flexDirection: 'column', padding: 12, gap: 10, color: 'inherit', fontFamily: 'system-ui,sans-serif', boxSizing: 'border-box' }, 'data-dsh-graphify': true },
    h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' } },
      h('div', { style: { fontSize: 14, fontWeight: 650 } }, 'Graphify · Knowledge Graph'),
      h('button', { style: BUTTON, onClick: reload, disabled: status.loading }, status.loading ? 'Loading…' : '↻ Refresh'),
    ),
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' } }, pill(countText), graph && graph.totalNodes > graph.nodes.length ? pill(`Displaying first ${graph.nodes.length} nodes`) : null),
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
      h('input', { type: 'search', value: search, style: FIELD, placeholder: 'Search functions, files, classes…', onChange: e => setSearch(e.target.value) }),
      matches.length ? h('div', { style: { maxHeight: 110, overflowY: 'auto', border: '1px solid #8490a04f', borderRadius: 9 } }, matches.map(n =>
        h('button', { key: n.id, style: { ...BUTTON, border: 0, display: 'block', textAlign: 'left', width: '100%', borderRadius: 0 }, onClick: () => { focus(n); setSearch('') } }, n.label)
      )) : null,
      graph ? h('select', { style: FIELD, value: community, onChange: e => setCommunity(e.target.value) },
        h('option', { value: '' }, 'All communities'),
        groups.map(g => h('option', { key: g, value: g }, g))) : null,
    ),
    status.loading ? h('p', { role: 'status', style: { opacity: .7, fontSize: 12 } }, 'Reading graphify-out/graph.json from this session workspace…') : null,
    status.error ? h('div', { role: 'alert', style: { padding: 12, border: '1px solid #c779795c', borderRadius: 10, fontSize: 12 } },
      h('strong', null, 'No graph is available in this project.'),
      h('p', { style: { overflowWrap: 'anywhere' } }, status.error),
      h('p', null, 'Ask the DSH Agent to use graphify_build, or run ', h('code', null, 'graphify .'), ' in the project directory. Then click Refresh.'),
    ) : null,
    graph ? h(GraphCanvas, { graph, selected, onSelect: n => { setSelected(n); setPathTarget('') }, filterCommunity: community, highlightedPath: path, viewport, setViewport }) : h('div', { style: { flex: 1 } }),
    current ? h('div', { style: { padding: 10, border: '1px solid #8490a04f', borderRadius: 10, fontSize: 12, maxHeight: 200, overflowY: 'auto' } },
      h('div', { style: { fontWeight: 650, overflowWrap: 'anywhere', marginBottom: 5 } }, current.label),
      h('div', { style: { opacity: .7 } }, `Community: ${current.community}`, current.kind ? ` · ${current.kind}` : ''),
      current.source ? h('div', { style: { overflowWrap: 'anywhere', opacity: .85 } }, `${current.source}${current.line ? ` · ${current.line}` : ''}`) : null,
      h('div', { style: { display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' } },
        h('select', { style: FIELD, value: pathTarget, onChange: e => setPathTarget(e.target.value) },
          h('option', { value: '' }, 'Trace path to…'),
          graph.nodes.filter(n => n.id !== selected).sort((a, b) => a.label.localeCompare(b.label)).map(n => h('option', { key: n.id, value: n.id }, n.label))
        ),
        pathTarget ? pill(path.length ? `${path.length - 1} hops` : 'No path') : null,
      )
    ) : null,
    h('div', { style: { opacity: .58, fontSize: 11, lineHeight: '16px' } }, 'Data: graphify-out/graph.json · Source parsing remains local. Ask Agent: “Use graphify_build to update this project”.'),
  )
}

exports.inject = ['slots', 'sidebarRightTabs', 'remote', 'remote.workspaceFiles']
exports.apply = function apply(ctx) {
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: PLUGIN_ID, kind: 'graphify', priority: 'extension', title: () => 'Graphify',
    guide: [{ id: 'graphify.open', order: 80, title: () => 'Graphify', description: () => 'Interactive code knowledge graph' }],
  }), 'dsh-graphify:tab-definition')
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab', key: PLUGIN_ID,
    inject: sessionId => ({
      loadGraph: async signal => {
        const result = await ctx.remote.workspaceFiles.readBytes(sessionId, 'graphify-out/graph.json', {}, signal)
        return result.data
      },
    }),
  }, GraphPanel)), 'dsh-graphify:tab-body')
}
exports.__test = { normaliseGraph, layoutGraph, shortestPath }

return module.exports; } });

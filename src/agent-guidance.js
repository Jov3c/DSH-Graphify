import { existsSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'

/**
 * Graphify is an optional project-context capability, never a blanket
 * requirement to call tools on unrelated chat turns.
 */
export function projectPolicy(session, policyRoot, settings) {
  const cwd = session?.header?.cwd
  if (typeof cwd !== 'string' || !isAbsolute(cwd) || typeof policyRoot !== 'string' || !isAbsolute(policyRoot)) return null
  const root = resolve(cwd)
  const bound = resolve(policyRoot)
  const rel = relative(bound, root)
  if (rel === '..' || rel.startsWith('../') || rel.startsWith('..\\') || isAbsolute(rel)) return null
  if (settings.scope === 'allowlist' && !settings.allowlist.some(p => typeof p === 'string' && isAbsolute(p) && resolve(p).toLowerCase() === root.toLowerCase())) return null
  return root
}

const TOOLS = [
  'graphify_query for broad code architecture or dependency questions',
  'graphify_explain for the responsibility and neighbors of one symbol/module',
  'graphify_path for relationships or call chains between two known nodes',
  'graphify_affected for the blast radius of a proposed code change',
].join('; ')

export function graphifyAgentGuidance({ session, policyRoot, settings, exists = existsSync }) {
  if (settings.agentUsage === 'off') return ''
  if (!session) return ''
  const root = projectPolicy(session, policyRoot, settings)
  if (!root) return ''
  const hasGraph = exists(join(root, 'graphify-out', 'graph.json'))
  if (settings.agentUsage === 'on-request') {
    return 'Graphify is installed. Only use Graphify tools when the user explicitly requests the graph/Graphify, including natural-language requests. Do not call Graphify for other tasks. Never initiate Graphify semantic/LLM extraction without separate authorization.'
  }
  const instructions = [
    'Project code intelligence: Graphify can help you answer codebase-specific questions. It is OPTIONAL; never call it for greetings, general knowledge, non-project questions, or as a ritual before every tool.',
    'When the user asks naturally about this project architecture, symbols, dependencies, call paths, or proposed change impact, prefer the smallest applicable graph tool, without asking the user to type tool names: ' + TOOLS + '.',
    'Graph results are a map, not proof: verify current source for critical claims, ambiguous matches, modified files, or destructive edits. Respect user requests not to use Graphify.',
    'Graphify calls, especially graphify_build, are code-only and require no separate AI API. Do not enable semantic extraction, change repository instructions, install hooks, or upload documents automatically.',
  ]
  if (hasGraph) {
    instructions.push('The current project contains graphify-out/graph.json. Prefer querying it for relevant project-analysis questions; avoid rebuilding an existing graph without a reason.')
  } else if (settings.mode === 'auto' || settings.mode === 'open') {
    instructions.push('No graph.json exists yet. The user allows automatic indexing for this project. If a codebase-specific request would materially benefit and no background build is already running, you may call graphify_build; otherwise use ordinary source tools. Never block a simple answer waiting for indexing.')
  } else {
    instructions.push('No graph.json exists and automatic indexing is disabled in settings. Do not call graphify_build unless the user explicitly asks for a build. Answer using ordinary tools instead.')
  }
  return instructions.join('\n')
}

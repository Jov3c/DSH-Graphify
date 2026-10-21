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

const ROUTES = [
  'Project overview, architecture, modules, dependencies, search: graphify_query.',
  'Single class/function/module responsibilities: graphify_explain.',
  'How two code symbols or modules connect: graphify_path.',
  'Before editing, refactoring, or deleting a component; login/auth changes; what could break; which tests to run: graphify_affected.',
  'Check graph completeness, isolated nodes or diagnostic issues: graphify_health.',
  'Generate original hierarchy or architecture callflow HTML: graphify_view.',
  'Generate project Wiki, Obsidian or GraphML documentation: graphify_export.',
  'Read PR overview/conflicts or Git Hook status when user requests: graphify_workflow; PR detail and explicit triage: graphify_pr.',
  'Graphify memory, Git hook install, global/merged graphs, external URL import or semantic LLM extraction are explicit opt-in advanced operations: use the matching graphify_* tool only after the user enables the corresponding setting.',
].join(' ')

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
    'Graphify is the project code intelligence tool. Its usage is OPTIONAL for greetings, general knowledge, non-project questions, trivial isolated edits, and tasks the user explicitly excludes from Graphify. Never call Graphify for those.',
    'For NONTRIVIAL questions about THIS PROJECT code (architecture, dependencies, bug tracing, login flow, module location, function explanations, change impact, refactoring or test impact), call the most specific Graphify read-only tool as the FIRST exploration step whenever an existing graph is available. Do this automatically for natural-language Chinese or English questions without requiring the user to mention Graphify or a tool identifier.',
    'Selection rules: ' + ROUTES,
    'If Graphify tools are not in the directly exposed catalog, use the configured DSH tool-discovery/search facility to find the matching Graphify tool before deciding it is unavailable. If unavailable or denied, fall back to reading project files.',
    'Graphify affected returns only static reverse dependencies. Additional co-import candidates are NOT confirmed impacts. For change-impact conclusions, ALWAYS verify event listeners, callbacks, runtime registration, DI, settings and relevant tests against current source. Never claim complete coverage based on graph alone.',
    'Do not repeat a graph lookup once sufficient evidence is available. Respect resource limits and workspace restrictions. Do not generate graph builds on unrelated questions.',
    'Graphify local code graph does not use a separate AI API. Advanced and Network/AI operations are disabled by default, require user opt-in through DSH settings, and must not be attempted automatically as routine context gathering. Do not install hooks, edit AGENTS.md or send source off-device without explicit authorization.',
  ]
  if (hasGraph) {
    instructions.push('The current project contains graphify-out/graph.json. For relevant nontrivial project-analysis questions, attempt a targeted Graphify read-only call before broad filesystem exploration; do not rebuild an existing graph without evidence it is stale.')
  } else if (settings.mode === 'auto' || settings.mode === 'open') {
    instructions.push('No graph.json exists yet. The user allows automatic indexing for this project. If a codebase-specific request would materially benefit and no background build is already running, you may call graphify_build; otherwise use ordinary source tools. Never block a simple answer waiting for indexing.')
  } else {
    instructions.push('No graph.json exists and automatic indexing is disabled in settings. Do not call graphify_build unless the user explicitly asks for a build. Answer using ordinary tools instead.')
  }
  return instructions.join('\n')
}

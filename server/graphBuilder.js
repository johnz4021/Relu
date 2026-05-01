// Graph builder — constructs concrete example graphs for algorithm_execution problems.
// Builds nodes, edges, positions, algorithm runs, and graph variants.
// Single Claude API call with structured tool output.

import Anthropic from '@anthropic-ai/sdk';

const defaultAnthropicClient = new Anthropic({ maxRetries: 3 });

const VIZ_PLANNER_SYSTEM_PROMPT = `You are a visualization planner for an algorithm tutoring system. Given a problem and its solver result, plan the optimal visualization layout.

Your job:
1. Analyze the problem and solution approach
2. Decide whether single-graph, multi-graph, or non-graph visualization is needed
3. Construct graph objects with nodes, edges, weights, and positions
4. Plan which algorithms to run and from which sources

WHEN TO USE MULTIPLE GRAPH PANELS:
- The problem requires comparing two different graph structures (G vs G')
- The problem requires running the same algorithm with different parameters side-by-side
- The problem involves a graph transformation where seeing before/after simultaneously aids understanding

WHEN TO USE A SINGLE GRAPH:
- Standard algorithm execution on one graph (Dijkstra, BFS, Kruskal, etc.)
- Problems that can be explained sequentially on one graph with reset_highlights between phases
- Proofs or theory questions with one supporting example

Default to single-graph unless comparison genuinely helps. Two panels split visual space.

GRAPH CONSTRUCTION RULES:
- Nodes: { id: "A", label: "A" } — id and label are both strings
- Edges: { source: "A", target: "B", weight: 5 } — weight is optional
- Positions: { "A": { x: 100, y: 100 } } — provide positions for clean layout
- directed: true/false — set based on the problem
- Position nodes in a readable layout. Space nodes 100-150px apart.
  For small graphs (5-7 nodes), arrange in a shape that makes the structure clear.
  For layered/DAG graphs, use top-to-bottom or left-to-right layout.

PANEL IDS:
- Single graph: use id "graph_main"
- Two graphs: use ids "graph_left" and "graph_right"
- Non-graph: use the renderer type as prefix, e.g. "array_main", "table_main"

ALGORITHM RUNS:
- Specify each algorithm to run with its graph_id and parameters
- Order matters — runs execute sequentially
- Common: { algorithm: "dijkstra", graph_id: "graph_main", source: "A" }

GRAPH VARIANTS (for transformation problems):
When the problem involves transforming a graph (e.g., road graph → time graph, G → G'),
pre-build ALL graph versions as variants. The teaching agent will swap between them
at the right narrative moment.

- The initial graph goes in panels[0].graph as usual
- Transformed versions go in graph_variants with descriptive keys
- Each variant includes: graph data, display title, and algorithm_runs to execute after swapping
- The teaching agent calls create_graph(variant_id: "time_graph") to swap — no inline construction needed

Example for "shortest travel time" problem:
  panels: [{ id: "graph_main", renderer: "graph", title: "Road Network", graph: roadGraph }]
  algorithm_runs: []  // no algo on initial graph
  graph_variants: {
    "time_graph": {
      graph: { nodes: [...], edges: [...with time weights...], positions: {...}, directed: true },
      title: "Time Graph (weight = distance/speed)",
      algorithm_runs: [{ algorithm: "dijkstra", graph_id: "graph_main", source: "1" }]
    }
  }
  teaching_notes: "Start with road network, explain the transformation (time = dist/speed),
    then call create_graph with variant_id 'time_graph'. Run Dijkstra on the time graph."

WHEN TO USE VARIANTS vs just having one graph:
- USE VARIANTS: problem explicitly transforms G into G' with different edges/weights
- USE VARIANTS: problem requires showing a reduction (e.g., vertex cover → independent set)
- DON'T USE: standard algorithm on one graph — just use the initial panel graph
- DON'T USE: problems where the graph structure doesn't change (just highlighting changes)

You MUST call submit_viz_plan with your complete plan. Do NOT respond with plain text.`;

const SUBMIT_VIZ_PLAN_TOOL = {
  name: 'submit_viz_plan',
  description: 'Submit the visualization plan for the problem.',
  input_schema: {
    type: 'object',
    properties: {
      reasoning: {
        type: 'string',
        description: 'Why this layout was chosen',
      },
      panels: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Unique panel ID (e.g., "graph_main", "graph_left")' },
            renderer: { type: 'string', description: 'Renderer type: graph, array, table, tree, linked, recursion_tree' },
            title: { type: 'string', description: 'Display title for the panel' },
            graph: {
              type: 'object',
              description: 'Graph data (only for graph panels)',
              properties: {
                nodes: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      label: { type: 'string' },
                    },
                    required: ['id', 'label'],
                  },
                },
                edges: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      source: { type: 'string' },
                      target: { type: 'string' },
                      weight: { type: 'number' },
                    },
                    required: ['source', 'target'],
                  },
                },
                positions: { type: 'object' },
                directed: { type: 'boolean' },
              },
            },
          },
          required: ['id', 'renderer'],
        },
      },
      algorithm_runs: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            algorithm: { type: 'string' },
            graph_id: { type: 'string' },
            source: { type: 'string' },
            sink: { type: 'string' },
          },
          required: ['algorithm', 'graph_id'],
        },
        description: 'Algorithms to run pre-teaching. Order matters.',
      },
      context_panels: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            type: {
              type: 'string',
              enum: ['key_value', 'collection', 'expression', 'log', 'pseudocode'],
            },
            title: { type: 'string' },
          },
        },
      },
      teaching_notes: {
        type: 'string',
        description: 'Guidance for the teaching agent on how to use this layout',
      },
      graph_variants: {
        type: 'object',
        description: 'Pre-built graph variants for transformation steps. Keys are variant IDs (e.g., "time_graph", "residual_graph"). The teaching agent swaps to these at the right narrative moment using create_graph with variant_id.',
        additionalProperties: {
          type: 'object',
          properties: {
            graph: {
              type: 'object',
              description: 'The transformed graph data',
              properties: {
                nodes: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, label: { type: 'string' } }, required: ['id', 'label'] } },
                edges: { type: 'array', items: { type: 'object', properties: { source: { type: 'string' }, target: { type: 'string' }, weight: { type: 'number' } }, required: ['source', 'target'] } },
                positions: { type: 'object' },
                directed: { type: 'boolean' },
              },
            },
            title: { type: 'string', description: 'Display title (e.g., "Time Graph (weight = distance/speed)")' },
            algorithm_runs: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  algorithm: { type: 'string' },
                  graph_id: { type: 'string' },
                  source: { type: 'string' },
                  sink: { type: 'string' },
                },
                required: ['algorithm', 'graph_id'],
              },
              description: 'Algorithms to run AFTER swapping to this variant.',
            },
          },
          required: ['graph', 'title'],
        },
      },
    },
    required: ['reasoning', 'panels', 'algorithm_runs'],
  },
};

const VIZ_PLANNER_TIMEOUT_MS = 120_000;

/**
 * Plan the visualization layout for a problem.
 * Returns { success: true, panels, algorithm_runs, context_panels, teaching_notes }
 * or { success: false }.
 */
export async function buildExampleGraph(problemText, solverResult, statusCallback, imageBase64, imageMimeType, anthropicClient) {
  if (statusCallback) statusCallback('Planning visualization...');

  try {
    const userContent = [];
    if (imageBase64 && imageMimeType) {
      userContent.push({
        type: 'image',
        source: { type: 'base64', media_type: imageMimeType, data: imageBase64 },
      });
    }

    let textPart = problemText
      ? `Plan the visualization for this problem:\n\n${problemText}`
      : 'Plan the visualization for the problem shown in the attached image.';

    if (solverResult) {
      textPart += `\n\n===== SOLVER RESULT =====\nApproach: ${solverResult.approach}\nKey Insight: ${solverResult.keyInsight}\nSolution: ${solverResult.solution}\n=====`;
    }

    userContent.push({ type: 'text', text: textPart });

    const responsePromise = (anthropicClient || defaultAnthropicClient).messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      system: VIZ_PLANNER_SYSTEM_PROMPT,
      tools: [SUBMIT_VIZ_PLAN_TOOL],
      messages: [{ role: 'user', content: userContent }],
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Viz planner timeout')), VIZ_PLANNER_TIMEOUT_MS)
    );

    if (statusCallback) statusCallback('Designing layout...');

    const response = await Promise.race([responsePromise, timeoutPromise]);

    const toolUse = response.content.find((b) => b.type === 'tool_use' && b.name === 'submit_viz_plan');
    if (!toolUse) {
      console.warn('[GraphBuilder] No submit_viz_plan tool call in response');
      return { success: false };
    }

    const plan = toolUse.input;
    console.log(`[GraphBuilder] Plan: ${plan.panels?.length} panels, ${plan.algorithm_runs?.length} algo runs, reasoning: ${plan.reasoning?.slice(0, 100)}`);

    return {
      success: true,
      reasoning: plan.reasoning,
      panels: plan.panels || [],
      algorithm_runs: plan.algorithm_runs || [],
      context_panels: plan.context_panels || [],
      teaching_notes: plan.teaching_notes || '',
      graph_variants: plan.graph_variants || null,
    };
  } catch (err) {
    console.error('[GraphBuilder] Failed:', err.message);
    return { success: false };
  }
}

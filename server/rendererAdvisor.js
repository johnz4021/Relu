// Renderer advisor — advises on renderer choice and viz stage plan
// for non-execution modes (D&C, DP, greedy, modeling, runtime).
// Single Claude API call with structured tool output.

import Anthropic from '@anthropic-ai/sdk';

const defaultAnthropicClient = new Anthropic({ maxRetries: 3 });

const DESIGN_VIZ_PLANNER_PROMPT = `You are a visualization advisor for an algorithm tutoring system. Given a solved design/proof problem, its reasoning mode, and the solver's solution, decide what visualization will help students understand the problem.

You are NOT building graphs or running algorithms. You are advising the teaching agent on:
1. Which renderer to use (or none)
2. When to create the visualization during the lesson
3. What to show at each teaching stage

REASONING MODES AND VIZ PATTERNS:

dc_design (divide-and-conquer):
  - Clean recurrence T(n) = aT(n/b) + O(n^d) → renderer: "recursion_tree"
    Create at: "at_recurrence" (when the recurrence is established).
    IMPORTANT: Extract a, b, d from the solver's solution and include as recurrence_params.
  - Case analysis / branching algorithm (e.g., different test outcomes lead to different paths) → renderer: "graph"
    Create at: "at_algorithm_design" (when cases are being enumerated).
    The graph renderer will be used as a decision tree: nodes = algorithm states, edges = decision outcomes (labeled via weight field). autoLayout arranges it hierarchically.
  - Pure structural/inductive proof with no algorithmic branching → renderer: null

dp_design (dynamic programming):
  - Standard table-fill DP → renderer: "table"
    Create at: "immediately" (table is useful from the start for filling in)
  - Tree-structured subproblems → renderer: "tree"
    Create at: "at_recurrence"

greedy_design:
  - Problem with interval/scheduling structure → renderer: "interval"
    Create at: "immediately"
  - Problem with graph structure → renderer: "graph"
    Create at: "at_algorithm_design"
  - Pure exchange argument with no visual component → renderer: null

modeling (LP, reductions, duality):
  - Reduction involving a graph transformation (e.g., reduce problem A to graph problem B) → renderer: "graph"
    Create at: "at_reduction" (when the mapping is being established)
  - Pure LP formulation / duality proof → renderer: null
    Formulation context panel is sufficient

runtime (asymptotics):
  - Recurrence to solve → renderer: "recursion_tree"
    Create at: "immediately"
    IMPORTANT: Extract a, b, d from the solver's solution and include as recurrence_params.
  - Non-recurrence runtime proof → renderer: null

RULES:
- DEFAULT TO NULL when unsure. An empty visualization panel is worse than no panel.
- If you recommend a renderer, be specific about WHEN to create it — "immediately" means right after run_solver, other values mean the agent should wait.
- If a recurrence T(n) = aT(n/b) + O(n^d) exists in the solution, ALWAYS extract a, b, d into recurrence_params. This is critical — it lets the agent populate the recursion tree without having to re-derive the parameters.
- viz_stages should map to the mode's teaching stages (e.g., SPLIT/SUBPROBLEMS/COMBINE/RECURRENCE for D&C).
- Keep viz_stages concise — the teaching agent handles the details.`;

const SUBMIT_DESIGN_VIZ_PLAN_TOOL = {
  name: 'submit_design_viz_plan',
  description: 'Submit your visualization recommendation for this design/proof problem.',
  input_schema: {
    type: 'object',
    properties: {
      reasoning: {
        type: 'string',
        description: 'Brief explanation of why this visualization choice fits the problem (1-3 sentences)',
      },
      renderer: {
        type: ['string', 'null'],
        description: 'Recommended renderer: "recursion_tree", "graph", "table", "tree", "interval", or null (no visualization needed)',
      },
      create_at_stage: {
        type: 'string',
        enum: ['immediately', 'at_recurrence', 'at_reduction', 'at_algorithm_design', 'never'],
        description: 'When the teaching agent should call create_visualization',
      },
      viz_stages: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            stage: { type: 'string', description: 'Teaching stage name (e.g., "SPLIT", "RECURRENCE")' },
            description: { type: 'string', description: 'What to visualize at this stage' },
          },
          required: ['stage', 'description'],
        },
        description: 'Stage-by-stage visualization plan (optional but recommended for complex problems)',
      },
      recurrence_params: {
        type: ['object', 'null'],
        properties: {
          a: { type: 'number', description: 'Number of recursive subproblems' },
          b: { type: 'number', description: 'Factor by which input shrinks' },
          d: { type: 'number', description: 'Exponent of work done at each level' },
        },
        description: 'If a recurrence T(n) = aT(n/b) + O(n^d) exists, extract a, b, d from the solver solution',
      },
      extra_context_panels: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            type: { type: 'string', enum: ['key_value', 'collection', 'expression', 'log', 'pseudocode'] },
            title: { type: 'string' },
          },
          required: ['id', 'type', 'title'],
        },
        description: 'Additional context panels beyond mode defaults (optional)',
      },
    },
    required: ['reasoning', 'renderer', 'create_at_stage'],
  },
};

const DESIGN_VIZ_PLANNER_TIMEOUT_MS = 30_000;

/**
 * Plan visualization for a design/proof mode problem.
 * Returns { success: true, renderer, create_at_stage, viz_stages, recurrence_params, ... }
 * or { success: false }.
 */
export async function adviseRenderer(problemText, solverResult, reasoningMode, statusCallback, imageBase64, imageMimeType, anthropicClient) {
  if (statusCallback) statusCallback('Planning visualization...');

  try {
    const userContent = [];
    if (imageBase64 && imageMimeType) {
      userContent.push({
        type: 'image',
        source: { type: 'base64', media_type: imageMimeType, data: imageBase64 },
      });
    }

    let textPart = `Reasoning mode: ${reasoningMode}\n\n`;
    textPart += problemText
      ? `Problem:\n${problemText}`
      : 'See the attached image for the problem.';

    if (solverResult) {
      textPart += `\n\n===== SOLVER RESULT =====\nApproach: ${solverResult.approach}\nKey Insight: ${solverResult.keyInsight}\nComplexity: ${solverResult.complexity}\nSolution: ${solverResult.solution}\n=====`;
    }

    userContent.push({ type: 'text', text: textPart });

    const responsePromise = (anthropicClient || defaultAnthropicClient).messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      system: DESIGN_VIZ_PLANNER_PROMPT,
      tools: [SUBMIT_DESIGN_VIZ_PLAN_TOOL],
      messages: [{ role: 'user', content: userContent }],
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Design viz planner timeout')), DESIGN_VIZ_PLANNER_TIMEOUT_MS)
    );

    const response = await Promise.race([responsePromise, timeoutPromise]);

    const toolUse = response.content.find((b) => b.type === 'tool_use' && b.name === 'submit_design_viz_plan');
    if (!toolUse) {
      console.warn('[RendererAdvisor] No submit_design_viz_plan tool call in response');
      return { success: false };
    }

    const plan = toolUse.input;
    console.log(`[RendererAdvisor] Plan: renderer=${plan.renderer}, create_at=${plan.create_at_stage}, recurrence=${plan.recurrence_params ? `a=${plan.recurrence_params.a},b=${plan.recurrence_params.b},d=${plan.recurrence_params.d}` : 'none'}, reasoning: ${plan.reasoning?.slice(0, 100)}`);

    return {
      success: true,
      reasoning: plan.reasoning,
      renderer: plan.renderer,
      create_at_stage: plan.create_at_stage,
      viz_stages: plan.viz_stages || [],
      recurrence_params: plan.recurrence_params || null,
      extra_context_panels: plan.extra_context_panels || [],
    };
  } catch (err) {
    console.error('[RendererAdvisor] Failed:', err.message);
    return { success: false };
  }
}

// Pre-teaching solver — solves the problem before the Socratic dialogue begins,
// giving the tutor a verified north star to guide toward.

import Anthropic from '@anthropic-ai/sdk';

const defaultAnthropicClient = new Anthropic({ maxRetries: 3 });

const SOLVER_SYSTEM_PROMPT = `You are an expert algorithm problem solver. Given a problem, solve it completely and rigorously. The problem may be provided as text, as an image (e.g. a screenshot of a textbook or competition problem), or both. If an image is provided, read and interpret it carefully.

Think deeply about the problem. Consider:
1. What is the optimal approach? (Not just the obvious one — consider if a non-obvious technique is needed)
2. What is the time/space complexity?
3. Is there a "paradigm shift" where the obvious approach fails and a non-obvious one is required?
4. Classify the problem: determine reasoning_mode and, if algorithm_execution, the target_algorithm.
   - algorithm_execution: problem asks to run/apply a specific known algorithm on given input
   - greedy_design: must design a greedy rule and prove correctness via exchange argument
   - dp_design: must define subproblem, write recurrence, prove correctness
   - dc_design: must design a divide-and-conquer algorithm and solve its recurrence
   - modeling: LP formulation, reduction to another problem, or duality argument
   - runtime: Big-O analysis, recurrence solving, or asymptotics only (no algorithm to run)

You MUST call the submit_solution tool with your complete analysis. Do NOT respond with plain text — always use the submit_solution tool.`;

const SUBMIT_SOLUTION_TOOL = {
  name: 'submit_solution',
  description: 'Submit your complete solution analysis for the problem.',
  input_schema: {
    type: 'object',
    properties: {
      solution: {
        type: 'string',
        description: 'Complete solution with explanation of the approach and key steps.',
      },
      approach: {
        type: 'string',
        description: 'Short name for the approach (e.g., "XOR bit encoding", "Dijkstra reduction", "DP on subsets").',
      },
      complexity: {
        type: 'string',
        description: 'Time and space complexity (e.g., "O(n log n) time, O(n) space").',
      },
      confidence: {
        type: 'string',
        enum: ['high', 'medium', 'low'],
        description: 'Confidence in the solution correctness.',
      },
      paradigmShift: {
        type: 'boolean',
        description: 'True if the obvious/naive approach won\'t achieve optimal complexity and a non-obvious technique is required.',
      },
      obviousApproach: {
        type: 'string',
        description: 'What approach most students would try first (e.g., "divide and conquer", "brute force BFS").',
      },
      keyInsight: {
        type: 'string',
        description: 'The single most important insight needed to solve this problem.',
      },
      selfCheckPassed: {
        type: 'boolean',
        description: 'Whether you verified your solution against sample cases or logical checks.',
      },
      reasoning_mode: {
        type: 'string',
        enum: ['algorithm_execution', 'modeling', 'greedy_design', 'dp_design', 'dc_design', 'runtime'],
        description: 'Teaching mode for this problem.',
      },
      is_in_scope: {
        type: 'boolean',
        description: 'True if a concrete supported algorithm can be executed (reasoning_mode is algorithm_execution and target_algorithm is known).',
      },
      target_algorithm: {
        type: 'string',
        description: 'Algorithm ID to run (e.g. "dijkstra", "kruskal", "maxflow"). Required when is_in_scope is true.',
      },
      closest_algorithm: {
        type: 'string',
        description: 'For non-execution modes, the algorithm most closely related to this problem (for teaching context).',
      },
      problem_summary: {
        type: 'string',
        description: 'One-sentence summary of what the problem is asking.',
      },
      critical_concepts: {
        type: 'array',
        items: { type: 'string' },
        description: '1-3 concepts the student MUST understand to solve this.',
      },
      internal_model_contract: {
        type: 'object',
        description: 'Internal reasoning contract — NOT shown to student.',
        properties: {
          state_definition: { type: 'string' },
          transition_rules: { type: 'string' },
          cost_model: { type: 'string' },
          feasibility_constraints: { type: 'string' },
          assumptions_to_verify: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    required: ['solution', 'approach', 'complexity', 'confidence', 'paradigmShift', 'obviousApproach', 'keyInsight', 'selfCheckPassed', 'reasoning_mode', 'is_in_scope'],
  },
};

const SUBMIT_SOLUTIONS_TOOL = {
  name: 'submit_solutions',
  description: 'Submit your complete solution analysis for ALL sub-problems in a single call.',
  input_schema: {
    type: 'object',
    properties: {
      solutions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            part_label: {
              type: 'string',
              description: 'The label of this part (e.g., "a", "b", "Part 1").',
            },
            solution: {
              type: 'string',
              description: 'Complete solution with explanation of the approach and key steps.',
            },
            approach: {
              type: 'string',
              description: 'Short name for the approach.',
            },
            complexity: {
              type: 'string',
              description: 'Time and space complexity.',
            },
            confidence: {
              type: 'string',
              enum: ['high', 'medium', 'low'],
              description: 'Confidence in the solution correctness.',
            },
            paradigmShift: {
              type: 'boolean',
              description: 'True if the obvious approach won\'t achieve optimal complexity.',
            },
            obviousApproach: {
              type: 'string',
              description: 'What approach most students would try first.',
            },
            keyInsight: {
              type: 'string',
              description: 'The single most important insight needed to solve this part.',
            },
            selfCheckPassed: {
              type: 'boolean',
              description: 'Whether you verified your solution against sample cases or logical checks.',
            },
            reasoning_mode: {
              type: 'string',
              enum: ['algorithm_execution', 'modeling', 'greedy_design', 'dp_design', 'dc_design', 'runtime'],
              description: 'Teaching mode for this part.',
            },
            is_in_scope: {
              type: 'boolean',
              description: 'True if a concrete supported algorithm can be executed.',
            },
            target_algorithm: {
              type: 'string',
              description: 'Algorithm ID to run. Required when is_in_scope is true.',
            },
            closest_algorithm: {
              type: 'string',
              description: 'For non-execution modes, the closest related algorithm.',
            },
            problem_summary: {
              type: 'string',
              description: 'One-sentence summary of what this part is asking.',
            },
            critical_concepts: {
              type: 'array',
              items: { type: 'string' },
              description: '1-3 concepts the student MUST understand to solve this part.',
            },
            internal_model_contract: {
              type: 'object',
              description: 'Internal reasoning contract — NOT shown to student.',
              properties: {
                state_definition: { type: 'string' },
                transition_rules: { type: 'string' },
                cost_model: { type: 'string' },
                feasibility_constraints: { type: 'string' },
                assumptions_to_verify: { type: 'array', items: { type: 'string' } },
              },
            },
          },
          required: ['part_label', 'solution', 'approach', 'complexity', 'confidence', 'paradigmShift', 'obviousApproach', 'keyInsight', 'selfCheckPassed', 'reasoning_mode', 'is_in_scope'],
        },
        description: 'Array of solutions, one per sub-problem.',
      },
    },
    required: ['solutions'],
  },
};

const SOLVER_TIMEOUT_MS = 300_000;

/**
 * Pre-solve multiple sub-problems in a single API call.
 * Returns { success: true, solutions: { [part_label]: solverResult } } or { success: false }.
 */
export async function solveProblems(subproblems, statusCallback, imageBase64, imageMimeType, anthropicClient) {
  if (statusCallback) statusCallback('Analyzing problems...');

  try {
    const userContent = [];
    if (imageBase64 && imageMimeType) {
      userContent.push({
        type: 'image',
        source: { type: 'base64', media_type: imageMimeType, data: imageBase64 },
      });
    }

    const partsText = subproblems
      .map((sp) => `[Part ${sp.part_label}]\n${sp.text}`)
      .join('\n\n');
    const textPart = `Solve ALL of the following sub-problems completely. They share context (same graph, variables, etc.). Call submit_solutions with one solution per part.\n\n${partsText}`;
    userContent.push({ type: 'text', text: textPart });

    const responsePromise = (anthropicClient || defaultAnthropicClient).messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      system: SOLVER_SYSTEM_PROMPT,
      tools: [SUBMIT_SOLUTIONS_TOOL],
      messages: [{ role: 'user', content: userContent }],
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Solver timeout')), SOLVER_TIMEOUT_MS)
    );

    if (statusCallback) statusCallback('Deep analysis (batch)...');

    const response = await Promise.race([responsePromise, timeoutPromise]);

    const toolUse = response.content.find((b) => b.type === 'tool_use' && b.name === 'submit_solutions');
    if (!toolUse) {
      console.warn('[Solver] No submit_solutions tool call in response');
      return { success: false };
    }

    const solutionsArray = toolUse.input.solutions;
    const solutions = {};
    for (const sol of solutionsArray) {
      const { part_label, ...rest } = sol;
      solutions[part_label] = { success: true, ...rest };
      console.log(`[Solver] Part ${part_label}: approach="${rest.approach}", confidence=${rest.confidence}`);
    }

    return { success: true, solutions };
  } catch (err) {
    console.error('[Solver] Batch failed:', err.message);
    return { success: false };
  }
}

/**
 * Pre-solve a problem using extended thinking.
 * Returns { success: true, ...solutionFields } or { success: false }.
 */
export async function solveProblem(problemText, statusCallback, imageBase64, imageMimeType, anthropicClient) {
  if (statusCallback) statusCallback('Analyzing problem...');

  try {
    // Build user message content blocks (supports text, image, or both)
    const userContent = [];
    if (imageBase64 && imageMimeType) {
      userContent.push({
        type: 'image',
        source: { type: 'base64', media_type: imageMimeType, data: imageBase64 },
      });
    }
    const textPart = problemText
      ? `Solve this problem completely:\n\n${problemText}`
      : 'Solve the problem shown in the attached image completely.';
    userContent.push({ type: 'text', text: textPart });

    const responsePromise = (anthropicClient || defaultAnthropicClient).messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      system: SOLVER_SYSTEM_PROMPT,
      tools: [SUBMIT_SOLUTION_TOOL],
      messages: [
        {
          role: 'user',
          content: userContent,
        },
      ],
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Solver timeout')), SOLVER_TIMEOUT_MS)
    );

    if (statusCallback) statusCallback('Deep analysis...');

    const response = await Promise.race([responsePromise, timeoutPromise]);

    // Extract the tool use block
    const toolUse = response.content.find((b) => b.type === 'tool_use' && b.name === 'submit_solution');
    if (!toolUse) {
      console.warn('[Solver] No submit_solution tool call in response');
      return { success: false };
    }

    const result = toolUse.input;
    console.log(`[Solver] Solved with approach="${result.approach}", confidence=${result.confidence}, paradigmShift=${result.paradigmShift}`);

    return { success: true, ...result };
  } catch (err) {
    console.error('[Solver] Failed:', err.message);
    return { success: false };
  }
}

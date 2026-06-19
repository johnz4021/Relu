// Claude tool schemas for ReLU

import { ALGORITHMS } from './algorithms/registry.js';
import { RENDERER_MANIFEST } from './rendererManifest.js';

const algorithmEnum = Object.keys(ALGORITHMS);

// Every legal viz_action name, generated from the renderer manifest (plus context-panel
// actions and the server-intercepted toggle_residual). Constraining the schema to this
// enum stops hallucinated action names at the API boundary; vizValidator.js then checks
// the name is valid FOR the targeted renderer and that params match.
const vizActionEnum = [...new Set([
  ...Object.values(RENDERER_MANIFEST).flatMap((m) => m.actions.map((a) => a.name)),
  'update', 'append_log', 'clear', // context panels (client contextManager.js)
  'toggle_residual', // intercepted server-side in emit_segment
])].sort();

export const tools = [
  {
    name: 'create_graph',
    description:
      'Create and display a graph for the lesson. Call this first to set up the visualization for graph algorithms. For modeling/LP problems on graphs, include context_panels to show formulations alongside the graph.',
    input_schema: {
      type: 'object',
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
          description: 'Graph nodes',
        },
        edges: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              source: { type: 'string' },
              target: { type: 'string' },
              weight: { type: 'number' },
              color: { type: 'string', description: 'Optional edge color (CSS color string, e.g. "#ef4444" or "red")' },
            },
            required: ['source', 'target'],
          },
          description: 'Graph edges',
        },
        positions: {
          type: 'object',
          description: 'Node positions as { nodeId: { x, y } }',
        },
        directed: {
          type: 'boolean',
          description: 'Whether edges are directed (default true). Set false for undirected graphs (MST, etc).',
        },
        variant_id: {
          type: 'string',
          description: 'Load a pre-built graph variant from the visualization plan (e.g., "time_graph"). When specified, nodes/edges/positions/directed are ignored — the variant data is used instead.',
        },
        context_panels: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Unique panel ID (e.g., "formulation", "variables")' },
              type: {
                type: 'string',
                enum: ['key_value', 'collection', 'expression', 'log', 'pseudocode'],
                description: 'Panel display type',
              },
              title: { type: 'string', description: 'Display title' },
              initial_data: { type: 'object', description: 'Initial data for the panel (optional)' },
            },
            required: ['id', 'type', 'title'],
          },
          description: 'Optional context panels to show alongside the graph (e.g., LP formulation, proof skeleton).',
        },
      },
      required: ['nodes', 'edges'],
    },
  },
  {
    name: 'create_visualization',
    description:
      'Set up the visualization panel(s) for the current lesson. Call this INSTEAD of create_graph for non-graph algorithms (sorting, DP, trees, etc.). For graph algorithms, use create_graph instead.',
    input_schema: {
      type: 'object',
      properties: {
        panels: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'Unique panel ID (e.g., "graph_left", "graph_right"). Auto-generated if omitted.',
              },
              renderer: {
                type: 'string',
                // Generated from the manifest — every client renderer is mountable.
                // (string and interval were missing from the old hardcoded list, which
                // made those renderers unreachable for on-the-fly visualizations.)
                enum: Object.keys(RENDERER_MANIFEST),
              },
              title: {
                type: 'string',
                description: 'Display title shown at the top of the panel (e.g., "Original Graph G", "Transformed G\'")',
              },
              config: {
                type: 'object',
                description: 'Renderer-specific initial config',
              },
            },
            required: ['renderer'],
          },
          description:
            'Visualization panels to display. Usually one, but some algorithms need two (e.g., heapsort needs array + tree, or side-by-side graphs for comparison).',
        },
        context_panels: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Unique panel ID (e.g., "distances", "pq")' },
              type: {
                type: 'string',
                enum: ['key_value', 'collection', 'expression', 'log', 'pseudocode'],
                description: 'Panel display type',
              },
              title: { type: 'string', description: 'Display title (e.g., "Distances", "Priority Queue")' },
              initial_data: { type: 'object', description: 'Initial data for the panel (optional)' },
            },
            required: ['id', 'type', 'title'],
          },
          description: 'Supplementary context panels to show alongside the main visualization. Use these for metadata like distance tables, queue contents, pseudocode, etc.',
        },
      },
      required: ['panels'],
    },
  },
  {
    name: 'run_algorithm',
    description:
      'Execute an algorithm and get the full execution trace. Use this to get the actual step-by-step trace before narrating. For graph algorithms, also pass source. For sorting, optionally pass a custom array. For search, pass array and target.',
    input_schema: {
      type: 'object',
      properties: {
        algorithm: {
          type: 'string',
          // No enum: Tier 2 sessions legally pass an off-registry pattern key
          // (e.g. "n_queens_backtracking" from the [TIER 2 TRACE] session context).
          // Server-side validation in agentLib rejects anything that is neither a
          // registry key nor the session's pattern key, preserving the typo
          // protection the enum used to provide.
          description: `Algorithm to execute. One of the registered algorithms (${algorithmEnum.join(', ')}) — or, in sessions with a generated (Tier 2) trace, the exact pattern key named in your session context.`,
        },
        source: {
          type: 'string',
          description: 'Source node ID (for graph algorithms)',
        },
        sink: {
          type: 'string',
          description: 'Sink node ID (for max flow algorithms)',
        },
        input: {
          type: 'object',
          description:
            'Algorithm-specific input. For sorting: { array: [5,3,8,1] }. For search: { array: [...], target: 23 }. Omit to use default sample data.',
        },
        graph_id: {
          type: 'string',
          description: 'Panel ID of the graph to run on (e.g., "graph_left"). Uses default graph if omitted.',
        },
      },
      required: ['algorithm'],
    },
  },
  {
    name: 'emit_segment',
    description:
      'Emit a teaching segment with narration text and optional visualization actions. Each segment is atomic — it will be fully played (TTS + animation) before the next segment starts. Use this to narrate each step of the algorithm. Note: If a visualization is active and your narration references a specific node, edge, cell, or step by name, include a viz_action to highlight it. Conversational or summary segments without specific element references don\'t need viz_actions.',
    input_schema: {
      type: 'object',
      properties: {
        narration: {
          type: 'string',
          description:
            'The narration text to speak aloud. Should be conversational and educational.',
        },
        trace_step_indices: {
          type: 'array',
          items: { type: 'integer' },
          description:
            'Indices into the algorithm trace (from run_algorithm) to animate in this segment. The system automatically generates the correct viz_actions and context panel updates. You can reference multiple steps to batch them into one segment. PREFER this over manual viz_actions.',
        },
        graph_id: {
          type: 'string',
          description: 'Which graph panel\'s trace to use for trace_step_indices (e.g., "graph_left"). Uses default trace if omitted.',
        },
        viz_actions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              renderer: {
                type: 'string',
                description: 'Which renderer to target. REQUIRED for all viz actions. Use panel IDs (e.g., "graph_left") for multi-panel layouts, or standard names ("graph", "array", "context") for single-panel.',
              },
              action: {
                type: 'string',
                enum: vizActionEnum,
                description: 'Renderer-specific action name. Must be one of the documented actions for the TARGETED renderer (the enum is the union across all renderers — e.g. set_data is array-only, fill_cell is table-only).',
              },
              params: {
                type: 'object',
                description: 'Action parameters (renderer-specific)',
              },
              // Legacy graph fields (backward compat)
              node: { type: 'string' },
              from: { type: 'string' },
              to: { type: 'string' },
              label: { type: 'string' },
              path: { type: 'array', items: { type: 'string' } },
              table: {
                type: 'object',
                description: 'Distance table as { nodeId: distance }',
              },
              className: { type: 'string' },
            },
            required: ['renderer', 'action'],
          },
          description:
            'Manual visualization actions. Only use when trace_step_indices cannot express what you need (rare). If both trace_step_indices and viz_actions are provided, auto-generated actions come first, then these are appended. Special action: toggle_residual ({action: "toggle_residual", show: true/false}) switches the graph between original and residual views. Every action is validated server-side against the renderer documentation: invalid action names or params are stripped and reported back to you — if ALL actions are invalid the call fails with the exact errors so you can fix and re-emit.',
        },
        phase: {
          type: 'string',
          description:
            'Current phase label (e.g., "Initialization", "Processing Node A", "Results")',
        },
        delay_ms: {
          type: 'number',
          description:
            'Additional delay in ms after TTS finishes (default 500). Use longer delays for complex visualizations.',
        },
        // STUCK COMPANION MODE self-report (eng D2). Optional; REQUIRED only in
        // companion mode. Mirrors conversational_reply so viz-bearing companion turns
        // (the structure/solution reveal) carry the same pacing signal.
        learner_state: {
          type: 'string',
          enum: ['not_attempted', 'wrong_direction', 'partial', 'understands', 'disengaged'],
          description: 'COMPANION MODE only: your read of where the student is this turn.',
        },
        specificity_level: {
          type: 'integer',
          minimum: 1,
          maximum: 5,
          description: 'COMPANION MODE only: how specific this segment is (1=open question … 5=full reveal).',
        },
        reveals_key_insight: {
          type: 'boolean',
          description: 'COMPANION MODE only: true ONLY if this segment legitimately states the reserved key insight.',
        },
        offer_made: {
          type: 'boolean',
          description: 'COMPANION MODE only: true when this turn explicitly OFFERS an escalation (names the next step or the drawing and asks). An open thinking-question is NOT an offer.',
        },
        offer_modality: {
          type: 'string',
          enum: ['highlight', 'diagram'],
          description: "COMPANION MODE only: set ALONGSIDE offer_made=true when the offered next step is a VISUAL rung — 'highlight' (point at the relevant part of the problem on the page) or 'diagram' (draw the structure view). Omit for non-visual offers. The client renders a tappable chip from this; button copy and consent text are client-owned, so DO NOT author labels here.",
        },
        escalation_consented: {
          type: 'boolean',
          description: "COMPANION MODE only: true ONLY when this turn's specificity rise was explicitly licensed (student asked, accepted your offer, or gave up).",
        },
      },
      required: ['narration'],
    },
  },
  {
    name: 'respond_to_interrupt',
    description:
      'Respond to a learner question using visual explanation. Pick the right mode based on the question type:\n- "overlay": for "why?" questions — dims irrelevant elements, spotlights relevant ones, adds annotations\n- "rewind": for "what just happened?" — replays recent steps more slowly\n- "ghost_alternative": for "what if?" — shows alternative paths as ghost overlays\nAfter the explanation, continue teaching from where you left off.',
    input_schema: {
      type: 'object',
      properties: {
        answer: {
          type: 'string',
          description: 'Spoken answer to the learner',
        },
        explanation_mode: {
          type: 'string',
          enum: ['overlay', 'rewind', 'ghost_alternative', 'illustrate', 'none'],
          description: 'Visual explanation mode. Use "none" for simple verbal answers.',
        },
        overlay: {
          type: 'object',
          description: 'Config for overlay mode. Required when explanation_mode is "overlay". Example: { "spotlight_nodes": ["A", "B"], "spotlight_edges": [{"from": "A", "to": "B"}], "annotations": [{"target": "A", "text": "source node", "position": "top"}, {"target": "B", "text": "relaxed to dist 4", "position": "right"}] }',
          properties: {
            spotlight_nodes: {
              type: 'array',
              items: { type: 'string' },
              description: 'Node IDs to spotlight (graph + tree renderers)',
            },
            spotlight_edges: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  from: { type: 'string' },
                  to: { type: 'string' },
                },
                required: ['from', 'to'],
              },
              description: 'Edges to spotlight (graph + tree renderers)',
            },
            spotlight_indices: {
              type: 'array',
              items: { type: 'number' },
              description: '0-based indices to spotlight (array + linked renderers)',
            },
            spotlight_cells: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  row: { type: 'number' },
                  col: { type: 'number' },
                },
                required: ['row', 'col'],
              },
              description: 'Cells to spotlight (table renderer)',
            },
            annotations: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  target: { type: 'string', description: 'Node ID, index number, or "row-col" string to anchor to' },
                  text: { type: 'string' },
                  position: {
                    type: 'string',
                    enum: ['top', 'bottom', 'left', 'right'],
                    description: 'Relative to target',
                  },
                },
                required: ['target', 'text'],
              },
            },
          },
        },
        rewind: {
          type: 'object',
          description: 'Config for rewind mode. Required when explanation_mode is "rewind". Must be a JSON object — never XML or plain text. Example: { "steps_back": 3, "narration_per_step": ["First we relaxed edge A→B setting its distance to 4...", "Then we updated D\'s tentative distance via B...", "Finally we finalized node C with distance 6..."] }',
          properties: {
            steps_back: { type: 'number', description: 'How many segments to rewind (1-5)' },
            narration_per_step: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Re-narration text for each replayed step, using different/clearer wording',
            },
          },
        },
        ghost_alternative: {
          type: 'object',
          description:
            'Config for ghost_alternative mode. Required when explanation_mode is "ghost_alternative". Example: { "ghost_path": ["A", "C", "D"], "actual_path": ["A", "B", "D"], "ghost_label": "cost: 9 (suboptimal)", "actual_label": "cost: 7 (chosen)" }',
          properties: {
            ghost_path: {
              type: 'array',
              items: { type: 'string' },
              description: 'Node IDs forming the alternative path (graph + tree renderers)',
            },
            actual_path: {
              type: 'array',
              items: { type: 'string' },
              description: 'Node IDs of the actual chosen path (graph + tree renderers)',
            },
            ghost_indices: {
              type: 'array',
              items: { type: 'number' },
              description: '0-based indices for the alternative choice (array + linked renderers)',
            },
            actual_indices: {
              type: 'array',
              items: { type: 'number' },
              description: '0-based indices for the actual choice (array + linked renderers)',
            },
            ghost_label: {
              type: 'string',
              description: 'Label for the ghost/alternative (e.g., "cost: 7")',
            },
            actual_label: {
              type: 'string',
              description: 'Label for the actual choice (e.g., "cost: 6")',
            },
          },
        },
        illustrate: {
          type: 'object',
          description: 'Build a temporary small example graph and animate through it step-by-step. Use for conceptual "why?" questions where the current graph cannot demonstrate the concept. The lesson graph auto-restores after. Required when explanation_mode is "illustrate". Example: { "graph": { "nodes": [{"id": "A", "label": "A"}, {"id": "B", "label": "B"}, {"id": "C", "label": "C"}], "edges": [{"source": "A", "target": "B"}, {"source": "B", "target": "C"}], "directed": true } }',
          properties: {
            graph: {
              type: 'object',
              description: 'Small example graph (3-6 nodes). Same format as create_graph.',
              properties: {
                nodes: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: { id: { type: 'string' }, label: { type: 'string' } },
                    required: ['id'],
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
                directed: { type: 'boolean' },
              },
              required: ['nodes', 'edges'],
            },
          },
          required: ['graph'],
        },
        viz_actions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              action: { type: 'string', enum: vizActionEnum },
              node: { type: 'string' },
              from: { type: 'string' },
              to: { type: 'string' },
              label: { type: 'string' },
              path: { type: 'array', items: { type: 'string' } },
              table: { type: 'object' },
              className: { type: 'string' },
            },
            required: ['action'],
          },
          description:
            'Additional viz actions (same as emit_segment). Applied AFTER explanation mode setup.',
        },
      },
      required: ['answer', 'explanation_mode'],
    },
  },
  {
    name: 'end_illustration',
    description: 'End an active illustration and restore the original lesson graph. Call this after teaching on an example graph set up by respond_to_interrupt with illustrate mode.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'update_graph',
    description:
      'Incrementally modify the current graph. Add or remove nodes and edges. Nodes are auto-positioned if no positions exist.',
    input_schema: {
      type: 'object',
      properties: {
        add_nodes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              label: { type: 'string' },
            },
            required: ['id'],
          },
          description: 'Nodes to add',
        },
        add_edges: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              source: { type: 'string' },
              target: { type: 'string' },
              weight: { type: 'number' },
              color: { type: 'string', description: 'Optional edge color (CSS color string, e.g. "#ef4444" or "red")' },
            },
            required: ['source', 'target'],
          },
          description: 'Edges to add',
        },
        remove_nodes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Node IDs to remove',
        },
        remove_edges: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              source: { type: 'string' },
              target: { type: 'string' },
            },
            required: ['source', 'target'],
          },
          description: 'Edges to remove',
        },
        directed: {
          type: 'boolean',
          description: 'Whether the graph is directed (default true)',
        },
      },
    },
  },
  {
    name: 'send_options',
    description:
      'Send an interaction prompt to the learner and wait for their response. Supports two modes: "mc" (default) shows clickable multiple-choice buttons, "open_ended" shows a text input for free-form predictions. Use this for comprehension checks and active recall at concept transitions.',
    input_schema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'The question to display to the learner',
        },
        options: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              label: { type: 'string' },
            },
            required: ['id', 'label'],
          },
          description: 'Clickable options for the learner to choose from (required for mc mode)',
        },
        mode: {
          type: 'string',
          enum: ['open_ended', 'mc'],
          description: 'open_ended = text input for prediction, mc = multiple choice buttons (default: mc)',
        },
        multiSelect: {
          type: 'boolean',
          description: 'Allow student to select multiple options. Default false.',
        },
        input_placeholder: {
          type: 'string',
          description: 'Placeholder text for the input field (open_ended mode)',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'conversational_reply',
    description: 'Send a short question or conversational nudge (1-2 sentences) and optionally wait for the learner\'s response. Use this for comprehension checks, predict-before-reveal moments, and Socratic follow-ups.',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The reply or question (1-2 sentences max)' },
        wait_for_response: { type: 'boolean', description: 'Wait for learner reply before continuing. Default true.' },
        // STUCK COMPANION MODE self-report (eng D2). Optional everywhere; REQUIRED only
        // in companion mode (the prompt instructs it). Other modes omit them entirely.
        learner_state: {
          type: 'string',
          enum: ['not_attempted', 'wrong_direction', 'partial', 'understands', 'disengaged'],
          description: 'COMPANION MODE only: your read of where the student is this turn.',
        },
        specificity_level: {
          type: 'integer',
          minimum: 1,
          maximum: 5,
          description: 'COMPANION MODE only: how specific this reply is (1=open question … 5=full reveal). +1 ONLY on a consented step (explicit ask, accepted offer, or give-up); otherwise ≤ your previous turn.',
        },
        reveals_key_insight: {
          type: 'boolean',
          description: 'COMPANION MODE only: true ONLY if this turn legitimately states the reserved key insight (student derived it, or they gave up and you are revealing). Never true on a partial-attempt turn.',
        },
        offer_made: {
          type: 'boolean',
          description: 'COMPANION MODE only: true when this turn explicitly OFFERS an escalation (names the next step or the drawing and asks). An open thinking-question is NOT an offer.',
        },
        offer_modality: {
          type: 'string',
          enum: ['highlight', 'diagram'],
          description: "COMPANION MODE only: set ALONGSIDE offer_made=true when the offered next step is a VISUAL rung — 'highlight' (point at the relevant part of the problem on the page) or 'diagram' (draw the structure view). Omit for non-visual offers. The client renders a tappable chip from this; the button copy and the consent text are owned by the client, so DO NOT author button labels here.",
        },
        escalation_consented: {
          type: 'boolean',
          description: "COMPANION MODE only: true ONLY when this turn's specificity rise was explicitly licensed (student asked, accepted your offer, or gave up). False on hold/lower turns.",
        },
      },
      required: ['text'],
    },
  },
];

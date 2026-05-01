export const DEFAULT_TRIE_INPUT = {
  operations: [
    { type: 'insert', word: 'apple' },
    { type: 'insert', word: 'app' },
    { type: 'insert', word: 'application' },
    { type: 'search', word: 'app' },
    { type: 'search', word: 'ap' },
    { type: 'search', word: 'apple' },
  ],
};

export function trie(operations) {
  const trace = [];

  // Trie node: { children: { char: node }, isEnd: bool, id: string }
  let nodeCounter = 0;
  function makeNode() {
    return { children: {}, isEnd: false, id: String(nodeCounter++) };
  }

  const root = makeNode();

  function getGraphSnapshot() {
    const nodes = [];
    const edges = [];

    function traverse(node, label) {
      nodes.push({
        id: node.id,
        label: label === '' ? 'root' : label,
        is_end: node.isEnd,
      });
      for (const [char, child] of Object.entries(node.children)) {
        edges.push({ source: node.id, target: child.id, label: char });
        traverse(child, char);
      }
    }
    traverse(root, '');

    return { nodes, edges, directed: true };
  }

  trace.push({
    type: 'init',
    description: `Initialize empty trie. ${operations.length} operation(s) to process.`,
    graph: getGraphSnapshot(),
  });

  for (const op of operations) {
    const word = op.word;

    if (op.type === 'insert') {
      trace.push({
        type: 'insert_start',
        word,
        description: `Insert "${word}" into the trie.`,
        graph: getGraphSnapshot(),
      });

      let current = root;
      let path = '';

      for (const char of word) {
        trace.push({
          type: 'insert_step',
          word,
          char,
          node_id: current.id,
          description: `At node "${path || 'root'}": looking for child edge '${char}'.${current.children[char] ? ' Exists, follow.' : ' Missing, create new node.'}`,
          graph: getGraphSnapshot(),
        });

        if (!current.children[char]) {
          current.children[char] = makeNode();
        }
        current = current.children[char];
        path += char;
      }

      current.isEnd = true;

      trace.push({
        type: 'insert_done',
        word,
        node_id: current.id,
        description: `Mark node at "${word}" as end-of-word. Insert complete.`,
        graph: getGraphSnapshot(),
      });

    } else if (op.type === 'search') {
      trace.push({
        type: 'search_start',
        word,
        description: `Search for "${word}" in the trie.`,
        graph: getGraphSnapshot(),
      });

      let current = root;
      let found = true;
      let path = '';

      for (const char of word) {
        trace.push({
          type: 'search_step',
          word,
          char,
          node_id: current.id,
          description: `At node "${path || 'root'}": look for child edge '${char}'.${current.children[char] ? ' Found, follow.' : ' Not found — prefix absent.'}`,
          graph: getGraphSnapshot(),
        });

        if (!current.children[char]) {
          found = false;
          break;
        }
        current = current.children[char];
        path += char;
      }

      if (found) {
        const isExact = current.isEnd;
        trace.push({
          type: 'search_done',
          word,
          node_id: current.id,
          result: isExact ? 'found' : 'prefix_only',
          description: isExact
            ? `"${word}" found as a complete word in the trie.`
            : `"${word}" is a prefix in the trie but not a complete word.`,
          graph: getGraphSnapshot(),
        });
      } else {
        trace.push({
          type: 'search_done',
          word,
          result: 'not_found',
          description: `"${word}" not found — path does not exist in the trie.`,
          graph: getGraphSnapshot(),
        });
      }
    }
  }

  trace.push({
    type: 'result',
    description: `Trie operations complete. Final structure contains ${nodeCounter - 1} nodes (excluding root).`,
    graph: getGraphSnapshot(),
  });

  return trace;
}

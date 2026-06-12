// Classifier routing eval for the broken-algo drain (eng review D7, 2026-06-12).
//
// SKIPPED BY DEFAULT — gated on RELU_EVAL=1 + ANTHROPIC_API_KEY (same convention
// as vizOnTheFly.eval.test.js). Un-flagging a `broken: true` registry entry
// automatically adds its key to the Haiku classifier's valid-algorithms list
// (leetcodeAgent.js filters on the flag). Whether the classifier actually ROUTES
// the canonical problem to that key is model behavior — the silent-misroute class
// the 2026-06-11 N-Queens incident proved is real. This eval re-runs on every
// future classifier/prompt/model change.
//
// Phase-aware: while an algo is still flagged broken, the invariant is that the
// classifier must NOT route to it (it's filtered from the prompt's key list).
// Once a phase un-flags it, the assertion flips to exact routing. No edits
// needed here as phases land — expectations derive from the registry flag.
//
//   Run with:  RELU_EVAL=1 npx vitest run server/leetcodeRouting.eval.test.js
//   (ANTHROPIC_API_KEY comes from .env via dotenv)

import { describe, it, expect } from 'vitest';
import 'dotenv/config';
import { parseLeetcodeProblem } from './leetcodeAgent.js';
import { ALGORITHMS } from './algorithms/registry.js';

const ENABLED = process.env.RELU_EVAL === '1' && !!process.env.ANTHROPIC_API_KEY;
const d = ENABLED ? describe : describe.skip;

const CASES = [
  {
    key: 'top_k_heap',
    lc: 'LC347',
    text: `Top K Frequent Elements

Given an integer array nums and an integer k, return the k most frequent elements. You may return the answer in any order.

Example 1:
Input: nums = [1,1,1,2,2,3], k = 2
Output: [1,2]

Example 2:
Input: nums = [1], k = 1
Output: [1]

Constraints:
1 <= nums.length <= 10^5
-10^4 <= nums[i] <= 10^4
k is in the range [1, the number of unique elements in the array].
It is guaranteed that the answer is unique.

Follow up: Your algorithm's time complexity must be better than O(n log n), where n is the array's size.`,
  },
  {
    key: 'k_closest_points',
    lc: 'LC973',
    text: `K Closest Points to Origin

Given an array of points where points[i] = [xi, yi] represents a point on the X-Y plane and an integer k, return the k closest points to the origin (0, 0).

The distance between two points on the X-Y plane is the Euclidean distance (i.e., √((x1 - x2)² + (y1 - y2)²)).

You may return the answer in any order. The answer is guaranteed to be unique (except for the order that it is in).

Example 1:
Input: points = [[1,3],[-2,2]], k = 1
Output: [[-2,2]]
Explanation: The distance between (1, 3) and the origin is sqrt(10). The distance between (-2, 2) and the origin is sqrt(8). Since sqrt(8) < sqrt(10), (-2, 2) is closer to the origin.

Constraints:
1 <= k <= points.length <= 10^4
-10^4 <= xi, yi <= 10^4`,
  },
  {
    key: 'tree_dp',
    lc: 'LC124',
    text: `Binary Tree Maximum Path Sum

A path in a binary tree is a sequence of nodes where each pair of adjacent nodes in the sequence has an edge connecting them. A node can only appear in the sequence at most once. Note that the path does not need to pass through the root.

The path sum of a path is the sum of the node's values in the path.

Given the root of a binary tree, return the maximum path sum of any non-empty path.

Example 1:
Input: root = [1,2,3]
Output: 6
Explanation: The optimal path is 2 -> 1 -> 3 with a path sum of 2 + 1 + 3 = 6.

Example 2:
Input: root = [-10,9,20,null,null,15,7]
Output: 42
Explanation: The optimal path is 15 -> 20 -> 7 with a path sum of 15 + 20 + 7 = 42.

Constraints:
The number of nodes in the tree is in the range [1, 3 * 10^4].
-1000 <= Node.val <= 1000`,
  },
  {
    key: 'median_finder',
    lc: 'LC295',
    text: `Find Median from Data Stream

The median is the middle value in an ordered integer list. If the size of the list is even, there is no middle value, and the median is the mean of the two middle values.

Implement the MedianFinder class:
MedianFinder() initializes the MedianFinder object.
void addNum(int num) adds the integer num from the data stream to the data structure.
double findMedian() returns the median of all elements so far.

Example 1:
Input: ["MedianFinder", "addNum", "addNum", "findMedian", "addNum", "findMedian"]
[[], [1], [2], [], [3], []]
Output: [null, null, null, 1.5, null, 2.0]

Constraints:
-10^5 <= num <= 10^5
There will be at least one element in the data structure before calling findMedian.
At most 5 * 10^4 calls will be made to addNum and findMedian.`,
  },
  {
    key: 'merge_k_sorted',
    lc: 'LC23',
    text: `Merge k Sorted Lists

You are given an array of k linked-lists lists, each linked-list is sorted in ascending order.

Merge all the linked-lists into one sorted linked-list and return it.

Example 1:
Input: lists = [[1,4,5],[1,3,4],[2,6]]
Output: [1,1,2,3,4,4,5,6]
Explanation: The linked-lists are: [1->4->5, 1->3->4, 2->6]. Merging them into one sorted list: 1->1->2->3->4->4->5->6.

Constraints:
k == lists.length
0 <= k <= 10^4
0 <= lists[i].length <= 500
-10^4 <= lists[i][j] <= 10^4
lists[i] is sorted in ascending order.`,
  },
  {
    key: 'linked_list_cycle',
    lc: 'LC141',
    text: `Linked List Cycle

Given head, the head of a linked list, determine if the linked list has a cycle in it.

There is a cycle in a linked list if there is some node in the list that can be reached again by continuously following the next pointer. Internally, pos is used to denote the index of the node that tail's next pointer is connected to. Note that pos is not passed as a parameter.

Return true if there is a cycle in the linked list. Otherwise, return false.

Example 1:
Input: head = [3,2,0,-4], pos = 1
Output: true
Explanation: There is a cycle in the linked list, where the tail connects to the 1st node (0-indexed).

Constraints:
The number of the nodes in the list is in the range [0, 10^4].
-10^5 <= Node.val <= 10^5
pos is -1 or a valid index in the linked-list.

Follow up: Can you solve it using O(1) (i.e. constant) memory?`,
  },
];

d('classifier routing — drained algorithms (RELU_EVAL=1)', () => {
  for (const { key, lc, text } of CASES) {
    const isDrained = !ALGORITHMS[key]?.broken;
    if (isDrained) {
      it(`${lc} routes to ${key} with confidence ≥ 0.7 and a test_case`, async () => {
        const parsed = await parseLeetcodeProblem(text);
        expect(parsed.algorithm_key).toBe(key);
        expect(parsed.confidence).toBeGreaterThanOrEqual(0.7);
        expect(parsed.test_case).toBeTruthy();
      }, 30000);
    } else {
      it(`${lc} must NOT route to still-broken ${key}`, async () => {
        const parsed = await parseLeetcodeProblem(text);
        expect(parsed.algorithm_key).not.toBe(key);
      }, 30000);
    }
  }
});

import assert from 'node:assert/strict'
import { apply } from './blog-tools.mjs'
const tools = []
apply({
  tools: {
    register(tool) {
      tools.push(tool)
    },
  },
})
assert.deepEqual(tools.map((tool) => tool.name).sort(), [
  'blog_read_public',
  'blog_search_public',
])
console.log('Fixed SDK tool registration: exactly two blog read tools')

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

const resource = (name) => {
  // Build packaging copies contracts beside the Worker; source tests use the
  // repository-generated declarations. Neither location is request-controlled.
  const local = new URL(`./${name}`, import.meta.url)
  const source = new URL(
    `../../../packages/contracts/agent/${name}`,
    import.meta.url
  )
  try {
    return readFileSync(local, 'utf8')
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    return readFileSync(source, 'utf8')
  }
}
export const rpcContract = JSON.parse(resource('rpc-v2.json'))
export const toolCatalog = JSON.parse(resource('tool-catalog.json'))
export const PROTOCOL = 'sun-world-agent/2'
if (rpcContract.protocol !== PROTOCOL) throw new Error('AGENT_PROFILE_MISMATCH')
export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const fail = () => {
  throw new Error('AGENT_INPUT_INVALID')
}
const object = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

// JSON.parse loses duplicate keys. Parse the bounded wire body before validation
// so neither duplicate identity fields nor 1e999 can be silently normalized.
export function parseJson(raw, maximum = 262144) {
  const bytes = Buffer.isBuffer(raw) ? raw : Buffer.from(raw)
  if (bytes.length > maximum) fail()
  let text
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    fail()
  }
  let index = 0
  const whitespace = () => {
    while (/[\t\r\n ]/.test(text[index] || '\0')) index++
  }
  function string() {
    const start = index++
    while (index < text.length) {
      const char = text[index++]
      if (char === '\\') index++
      else if (char === '"') {
        let result
        try {
          result = JSON.parse(text.slice(start, index))
        } catch {
          fail()
        }
        if (!result.isWellFormed()) fail()
        return result
      }
    }
    fail()
  }
  function value(depth) {
    if (depth > 64) fail()
    whitespace()
    const char = text[index]
    if (char === '"') return string()
    if (char === '{' || char === '[') {
      const isObject = char === '{'
      const result = isObject ? Object.create(null) : []
      const closing = isObject ? '}' : ']'
      index++
      whitespace()
      if (text[index] === closing) {
        index++
        return result
      }
      while (true) {
        whitespace()
        let key
        if (isObject) {
          if (text[index] !== '"') fail()
          key = string()
          if (Object.hasOwn(result, key)) fail()
          whitespace()
          if (text[index++] !== ':') fail()
        }
        const item = value(depth + 1)
        if (isObject) result[key] = item
        else result.push(item)
        whitespace()
        const next = text[index++]
        if (next === closing) return result
        if (next !== ',') fail()
      }
    }
    for (const [literal, result] of [
      ['true', true],
      ['false', false],
      ['null', null],
    ]) {
      if (text.startsWith(literal, index)) {
        index += literal.length
        return result
      }
    }
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(
      text.slice(index)
    )
    if (!match) fail()
    index += match[0].length
    const result = Number(match[0])
    if (!Number.isFinite(result)) fail()
    return result
  }
  const result = value(0)
  whitespace()
  if (index !== text.length) fail()
  return result
}

const annotations = new Set(['title', 'description', 'default', '$defs'])
const keywords = new Set([
  'type',
  '$ref',
  'const',
  'enum',
  'anyOf',
  'properties',
  'required',
  'additionalProperties',
  'items',
  'minItems',
  'maxItems',
  'minLength',
  'maxLength',
  'pattern',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
])
function validate(schema, value, root) {
  for (const key of Object.keys(schema))
    if (!annotations.has(key) && !keywords.has(key)) fail()
  if (schema.$ref) {
    if (!schema.$ref.startsWith('#/$defs/')) fail()
    const ref = root.$defs?.[schema.$ref.slice(8)]
    if (!ref) fail()
    validate(ref, value, root)
  }
  if (
    schema.anyOf &&
    !schema.anyOf.some((candidate) => {
      try {
        validate(candidate, value, root)
        return true
      } catch {
        return false
      }
    })
  )
    fail()
  if (Object.hasOwn(schema, 'const') && value !== schema.const) fail()
  if (schema.enum && !schema.enum.includes(value)) fail()
  if (schema.type === 'object') {
    if (!object(value)) fail()
    for (const key of schema.required || [])
      if (!Object.hasOwn(value, key)) fail()
    for (const key of Object.keys(value)) {
      if (Object.hasOwn(schema.properties || {}, key))
        validate(schema.properties[key], value[key], root)
      else if (schema.additionalProperties === false) fail()
    }
  } else if (schema.type === 'array') {
    if (
      !Array.isArray(value) ||
      value.length < (schema.minItems ?? 0) ||
      value.length > (schema.maxItems ?? Infinity)
    )
      fail()
    for (const item of value) validate(schema.items || {}, item, root)
  } else if (schema.type === 'string') {
    if (typeof value !== 'string' || !value.isWellFormed()) fail()
    const length = Array.from(value).length
    const match = schema.pattern && new RegExp(schema.pattern, 'u').exec(value)
    if (
      length < (schema.minLength ?? 0) ||
      length > (schema.maxLength ?? Infinity) ||
      (schema.pattern &&
        (!match || match.index !== 0 || match[0].length !== value.length))
    )
      fail()
  } else if (schema.type === 'integer' || schema.type === 'number') {
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      (schema.type === 'integer' && !Number.isSafeInteger(value)) ||
      value < (schema.minimum ?? -Infinity) ||
      value > (schema.maximum ?? Infinity) ||
      value <= (schema.exclusiveMinimum ?? -Infinity) ||
      value >= (schema.exclusiveMaximum ?? Infinity)
    )
      fail()
  } else if (schema.type === 'boolean' && typeof value !== 'boolean') fail()
  else if (schema.type === 'null' && value !== null) fail()
  else if (
    schema.type &&
    ![
      'object',
      'array',
      'string',
      'integer',
      'number',
      'boolean',
      'null',
    ].includes(schema.type)
  )
    fail()
}

export function validateRpc(name, value) {
  const schema = rpcContract.schemas[name]
  if (!schema) fail()
  validate(schema, value, schema)
  if (['ExecutionBinding', 'ExecutionStart', 'ExecutionAck'].includes(name)) {
    if (
      value.run_id.length !== 36 ||
      value.execution_id.length !== 36 ||
      !UUID_PATTERN.test(value.run_id) ||
      !UUID_PATTERN.test(value.execution_id)
    )
      fail()
  }
  if (name === 'ExecutionStart') {
    const date = new Date(value.deadline)
    if (
      !Number.isFinite(date.valueOf()) ||
      date.toISOString().slice(0, 19) !== value.deadline.slice(0, 19) ||
      value.root_session_id !== `blog-qa-${value.run_id}`
    )
      fail()
  }
  if (
    name === 'FinalResult' &&
    (new Set(value.source_ids).size !== value.source_ids.length ||
      !value.source_ids.every(
        (id) => id.length === 36 && UUID_PATTERN.test(id)
      ))
  )
    fail()
  return structuredClone(value)
}

export function validateTool(name, value) {
  const schema = toolCatalog.schemas[name]
  if (!schema) fail()
  validate(schema, value, schema)
  return structuredClone(value)
}

export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (object(value))
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map((key) => JSON.stringify(key) + ':' + canonical(value[key]))
        .join(',') +
      '}'
    )
  if (typeof value === 'number' && !Number.isFinite(value)) fail()
  if (typeof value === 'string' && !value.isWellFormed()) fail()
  const result = JSON.stringify(value)
  if (result === undefined) fail()
  return result
}

export const hashJson = (value) =>
  createHash('sha256').update(canonical(value)).digest('hex')

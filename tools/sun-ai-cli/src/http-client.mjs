export async function postJson(baseUrl, path, payload) {
  const response = await fetch(buildUrl(baseUrl, path), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return parseResponse(response)
}

export async function postStream(baseUrl, path, payload, write) {
  const response = await fetch(buildUrl(baseUrl, path), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`)
  }

  if (!response.body) {
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    write(decoder.decode(value, { stream: true }))
  }
}

export async function postQuery(baseUrl, path, query) {
  const url = buildUrl(baseUrl, path)
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value)
  }

  const response = await fetch(url, { method: 'POST' })
  return parseResponse(response)
}

export function unwrapApiResponse(payload) {
  if (
    payload &&
    typeof payload === 'object' &&
    Object.prototype.hasOwnProperty.call(payload, 'data')
  ) {
    return payload.data
  }
  return payload
}

function buildUrl(baseUrl, path) {
  return new URL(path, `${baseUrl.replace(/\/$/, '')}/`)
}

async function parseResponse(response) {
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text}`)
  }
  return text ? JSON.parse(text) : null
}

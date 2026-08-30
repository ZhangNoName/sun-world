const VALIDATION_ORIGIN = 'https://sunworld.invalid'
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/

function repeatedlyDecode(value: string) {
  let decoded = value
  for (let index = 0; index < 4; index += 1) {
    const next = decodeURIComponent(decoded)
    if (next === decoded) break
    decoded = next
  }
  return decoded
}

export function safeAuthReturnTo(
  value: string | null | undefined,
  fallback = '/aigc'
) {
  if (!value) return fallback
  try {
    const decoded = repeatedlyDecode(value.trim())
    if (
      !decoded.startsWith('/') ||
      decoded.startsWith('//') ||
      decoded.includes('\\') ||
      CONTROL_CHARACTERS.test(decoded)
    ) {
      return fallback
    }
    const resolved = new URL(value, VALIDATION_ORIGIN)
    if (resolved.origin !== VALIDATION_ORIGIN) return fallback
    return `${resolved.pathname}${resolved.search}${resolved.hash}`
  } catch {
    return fallback
  }
}

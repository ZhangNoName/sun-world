export interface FileLimits {
  accept?: string
  maxFiles: number
  maxFileSize: number
}

export interface FileValidationResult {
  accepted: File[]
  rejectedCount: number
}

export function validateIncomingFiles(
  current: File[],
  incoming: Iterable<File>,
  limits: FileLimits
): FileValidationResult {
  const accepted = [...current]
  const keys = new Set(current.map(fileKey))
  let rejectedCount = 0

  for (const file of incoming) {
    const key = fileKey(file)
    if (
      keys.has(key) ||
      accepted.length >= limits.maxFiles ||
      file.size > limits.maxFileSize ||
      !matchesAccept(file, limits.accept)
    ) {
      rejectedCount += 1
      continue
    }
    keys.add(key)
    accepted.push(file)
  }

  return { accepted, rejectedCount }
}

function fileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`
}

function matchesAccept(file: File, accept?: string) {
  if (!accept?.trim()) return true
  const name = file.name.toLowerCase()
  const mime = file.type.toLowerCase()
  return accept
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .some((rule) => {
      if (rule.startsWith('.')) return name.endsWith(rule)
      if (rule.endsWith('/*')) return mime.startsWith(rule.slice(0, -1))
      return mime === rule
    })
}

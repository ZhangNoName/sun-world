import type { UiIconName } from '@sun-world/icons/core'

export type AttachmentCategory =
  | 'image'
  | 'pdf'
  | 'spreadsheet'
  | 'archive'
  | 'audio'
  | 'video'
  | 'code'
  | 'document'

export interface FilePresentation {
  kind: 'image' | 'file'
  icon: UiIconName
  category: AttachmentCategory
}

const spreadsheetExtensions = new Set(['csv', 'xls', 'xlsx', 'ods'])
const archiveExtensions = new Set(['zip', 'rar', '7z', 'tar', 'gz', 'bz2'])
const audioExtensions = new Set(['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'])
const videoExtensions = new Set(['mp4', 'webm', 'mov', 'avi', 'mkv'])
const codeExtensions = new Set([
  'js',
  'jsx',
  'ts',
  'tsx',
  'json',
  'html',
  'css',
  'scss',
  'vue',
  'py',
  'java',
  'go',
  'rs',
  'sh',
  'yaml',
  'yml',
  'xml',
  'md',
])

export function filePresentation(file: File): FilePresentation {
  const mime = file.type.toLowerCase()
  const extension = file.name.toLowerCase().split('.').pop() ?? ''

  if (mime.startsWith('image/')) return presentation('image', 'image', 'image')
  if (mime === 'application/pdf' || extension === 'pdf') {
    return presentation('file', 'pdf', 'file-pdf')
  }
  if (
    mime.includes('spreadsheet') ||
    mime.includes('excel') ||
    mime === 'text/csv' ||
    spreadsheetExtensions.has(extension)
  ) {
    return presentation('file', 'spreadsheet', 'file-spreadsheet')
  }
  if (mime.includes('zip') || mime.includes('compressed') || archiveExtensions.has(extension)) {
    return presentation('file', 'archive', 'file-archive')
  }
  if (mime.startsWith('audio/') || audioExtensions.has(extension)) {
    return presentation('file', 'audio', 'file-audio')
  }
  if (mime.startsWith('video/') || videoExtensions.has(extension)) {
    return presentation('file', 'video', 'file-video')
  }
  if (
    mime.includes('json') ||
    mime.includes('javascript') ||
    mime === 'application/xml' ||
    mime === 'text/xml' ||
    mime.endsWith('+xml') ||
    codeExtensions.has(extension)
  ) {
    return presentation('file', 'code', 'file-code')
  }
  return presentation('file', 'document', 'file-text')
}

function presentation(
  kind: FilePresentation['kind'],
  category: AttachmentCategory,
  icon: UiIconName
): FilePresentation {
  return { kind, category, icon }
}

import { filePresentation } from './filePresentation'

describe('filePresentation', () => {
  it.each([
    ['photo.png', 'image/png', 'image', 'image', 'image'],
    ['report.pdf', 'application/pdf', 'file', 'pdf', 'file-pdf'],
    ['table.csv', 'text/csv', 'file', 'spreadsheet', 'file-spreadsheet'],
    ['bundle.zip', 'application/zip', 'file', 'archive', 'file-archive'],
    ['voice.mp3', 'audio/mpeg', 'file', 'audio', 'file-audio'],
    ['clip.mp4', 'video/mp4', 'file', 'video', 'file-video'],
    ['config.json', 'application/json', 'file', 'code', 'file-code'],
    ['letter.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'file', 'document', 'file-text'],
  ] as const)(
    'maps %s to a %s presentation',
    (name, type, expectedKind, expectedCategory, expectedIcon) => {
      const result = filePresentation(new File(['content'], name, { type }))

      expect(result).toEqual({
        kind: expectedKind,
        category: expectedCategory,
        icon: expectedIcon,
      })
    }
  )
})

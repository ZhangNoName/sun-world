import { validateIncomingFiles } from './files'

const file = (name: string, size: number, type: string, lastModified = 1) =>
  new File([new Uint8Array(size)], name, { type, lastModified })

describe('validateIncomingFiles', () => {
  it('accepts matching files and rejects duplicate, oversized, and excess files', () => {
    const existing = [file('existing.txt', 2, 'text/plain', 10)]
    const result = validateIncomingFiles(
      existing,
      [
        file('existing.txt', 2, 'text/plain', 10),
        file('photo.png', 4, 'image/png', 20),
        file('large.png', 9, 'image/png', 30),
        file('extra.png', 2, 'image/png', 40),
      ],
      { accept: 'image/*,.txt', maxFiles: 2, maxFileSize: 8 }
    )

    expect(result.accepted.map((item) => item.name)).toEqual([
      'existing.txt',
      'photo.png',
    ])
    expect(result.rejectedCount).toBe(3)
  })

  it('rejects files that do not match MIME types or extensions', () => {
    const result = validateIncomingFiles(
      [],
      [file('notes.md', 2, 'text/markdown'), file('movie.mp4', 2, 'video/mp4')],
      { accept: '.md,image/png', maxFiles: 3, maxFileSize: 8 }
    )
    expect(result.accepted.map((item) => item.name)).toEqual(['notes.md'])
    expect(result.rejectedCount).toBe(1)
  })
})

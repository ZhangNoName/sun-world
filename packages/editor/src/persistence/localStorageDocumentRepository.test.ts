import { ElementType, FillType } from '../elements/element.config'
import type { EditorDocumentSnapshotV1 } from '../document/editorDocument'
import { LocalStorageDocumentRepository } from './localStorageDocumentRepository'

function snapshot(id: string): EditorDocumentSnapshotV1 {
  return {
    version: 1,
    children: [
      {
        id,
        name: id,
        type: ElementType.Rect,
        visible: true,
        locked: false,
        parentId: 'root',
        width: 100,
        height: 80,
        transform: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
        fill: { type: FillType.Solid, color: '#ff0000' },
        children: [],
      },
    ],
  }
}

describe('LocalStorageDocumentRepository', () => {
  beforeEach(() => localStorage.clear())

  it('isolates documents behind versioned keys', async () => {
    const repository = new LocalStorageDocumentRepository(localStorage)
    await repository.save('document-a', snapshot('a'))
    await repository.save('document-b', snapshot('b'))

    expect(await repository.load('document-a')).toEqual(snapshot('a'))
    expect(await repository.load('document-b')).toEqual(snapshot('b'))
    expect(localStorage.getItem(repository.keyFor('document-a'))).not.toBeNull()
    expect(repository.keyFor('document-a')).toContain(':v1:')
  })

  it('returns null for invalid JSON and invalid document snapshots', async () => {
    const repository = new LocalStorageDocumentRepository(localStorage)
    localStorage.setItem(repository.keyFor('broken-json'), '{')
    localStorage.setItem(
      repository.keyFor('broken-snapshot'),
      JSON.stringify({ version: 1, children: [{ id: 'incomplete' }] })
    )

    await expect(repository.load('broken-json')).resolves.toBeNull()
    await expect(repository.load('broken-snapshot')).resolves.toBeNull()
  })

  it('propagates storage errors to the caller', async () => {
    const failingStorage: Storage = {
      get length() {
        return 0
      },
      clear: () => undefined,
      getItem: () => {
        throw new Error('storage unavailable')
      },
      key: () => null,
      removeItem: () => undefined,
      setItem: () => {
        throw new Error('storage unavailable')
      },
    }
    const repository = new LocalStorageDocumentRepository(failingStorage)

    await expect(repository.load('document')).rejects.toThrow(
      'storage unavailable'
    )
    await expect(repository.save('document', snapshot('one'))).rejects.toThrow(
      'storage unavailable'
    )
  })

  it('migrates valid legacy editor-data into the default document once', async () => {
    const repository = new LocalStorageDocumentRepository(localStorage)
    localStorage.setItem(
      'editor-data',
      JSON.stringify({
        version: 1,
        updatedAt: 1,
        data: snapshot('legacy').children,
      })
    )

    expect(await repository.load('default')).toEqual(snapshot('legacy'))
    expect(localStorage.getItem('editor-data')).toBeNull()
    expect(localStorage.getItem(repository.keyFor('default'))).not.toBeNull()

    localStorage.setItem(
      'editor-data',
      JSON.stringify({ version: 1, data: snapshot('stale').children })
    )
    expect(await repository.load('default')).toEqual(snapshot('legacy'))
  })
})

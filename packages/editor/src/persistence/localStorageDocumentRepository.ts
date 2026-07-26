import { EditorDocument } from '../document/editorDocument'
import type {
  EditorDocumentNodeSnapshot,
  EditorDocumentSnapshotV1,
} from '../document/editorDocument'
import { ElementType } from '../elements/element.config'
import type { DocumentRepository } from './documentRepository'

const DEFAULT_PREFIX = 'sun-world:editor:v1:'
const LEGACY_KEY = 'editor-data'

export class LocalStorageDocumentRepository implements DocumentRepository {
  constructor(
    private readonly storage: Storage = localStorage,
    private readonly keyPrefix = DEFAULT_PREFIX
  ) {}

  keyFor(documentId: string): string {
    return `${this.keyPrefix}${encodeURIComponent(documentId)}`
  }

  async load(documentId: string): Promise<EditorDocumentSnapshotV1 | null> {
    const raw = this.storage.getItem(this.keyFor(documentId))
    if (raw !== null) return this.parse(raw)
    if (documentId !== 'default') return null
    return this.migrateLegacy()
  }

  async save(
    documentId: string,
    snapshot: EditorDocumentSnapshotV1
  ): Promise<void> {
    if (!isValidSnapshot(snapshot)) {
      throw new TypeError('Invalid editor document snapshot')
    }
    this.storage.setItem(this.keyFor(documentId), JSON.stringify(snapshot))
  }

  private parse(raw: string): EditorDocumentSnapshotV1 | null {
    try {
      const value: unknown = JSON.parse(raw)
      return isValidSnapshot(value) ? value : null
    } catch {
      return null
    }
  }

  private async migrateLegacy(): Promise<EditorDocumentSnapshotV1 | null> {
    const raw = this.storage.getItem(LEGACY_KEY)
    if (raw === null) return null
    try {
      const legacy: unknown = JSON.parse(raw)
      if (!isRecord(legacy) || legacy.version !== 1) return null
      const snapshot = { version: 1, children: legacy.data }
      if (!isValidSnapshot(snapshot)) return null
      await this.save('default', snapshot)
      this.storage.removeItem(LEGACY_KEY)
      return snapshot
    } catch {
      return null
    }
  }
}

function isValidSnapshot(value: unknown): value is EditorDocumentSnapshotV1 {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !Array.isArray(value.children) ||
    !value.children.every((node) => isValidNode(node, 'root'))
  ) {
    return false
  }
  const snapshot: EditorDocumentSnapshotV1 = {
    version: 1,
    children: value.children as EditorDocumentNodeSnapshot[],
  }
  try {
    return new EditorDocument().importSnapshot(snapshot).ok
  } catch {
    return false
  }
}

function isValidNode(
  value: unknown,
  expectedParentId: string
): value is EditorDocumentNodeSnapshot {
  if (!isRecord(value) || !isRecord(value.transform)) return false
  const type = value.type
  const transform = value.transform
  if (
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    (type !== ElementType.Rect && type !== ElementType.Group) ||
    typeof value.visible !== 'boolean' ||
    typeof value.locked !== 'boolean' ||
    value.parentId !== expectedParentId ||
    typeof value.width !== 'number' ||
    typeof value.height !== 'number' ||
    !['a', 'b', 'c', 'd', 'e', 'f'].every(
      (key) => typeof transform[key] === 'number'
    ) ||
    !Array.isArray(value.children)
  ) {
    return false
  }
  return value.children.every((child) => isValidNode(child, value.id as string))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

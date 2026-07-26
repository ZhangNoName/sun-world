import type { EditorDocumentSnapshotV1 } from '../document/editorDocument'
import type { DocumentRepository } from './documentRepository'

export class MemoryDocumentRepository implements DocumentRepository {
  private readonly documents = new Map<string, EditorDocumentSnapshotV1>()

  async load(documentId: string): Promise<EditorDocumentSnapshotV1 | null> {
    const snapshot = this.documents.get(documentId)
    return snapshot ? structuredClone(snapshot) : null
  }

  async save(
    documentId: string,
    snapshot: EditorDocumentSnapshotV1
  ): Promise<void> {
    this.documents.set(documentId, structuredClone(snapshot))
  }
}

import type { EditorDocumentSnapshotV1 } from '../document/editorDocument'

export interface DocumentRepository {
  load(documentId: string): Promise<EditorDocumentSnapshotV1 | null>
  save(documentId: string, snapshot: EditorDocumentSnapshotV1): Promise<void>
}

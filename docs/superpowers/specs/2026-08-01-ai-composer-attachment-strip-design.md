# AI Composer Attachment Strip Design

## Goal

Upgrade the standalone AI composer's attachment experience into a compact,
single-row strip above the text input with type-aware visuals, image thumbnails,
duplicate feedback, and neutral upload-button focus styling.

## Confirmed interaction

- Selected attachments render before the textarea, at the top of the composer.
- Attachments stay in one horizontal row. When the content exceeds the available
  width, native horizontal scrolling supports mouse/trackpad and touch without
  wrapping the cards.
- Image files display a local thumbnail only. Clicking the thumbnail does not
  open a larger viewer.
- Non-image cards display a type-specific Sun World icon and the filename.
- No attachment card displays file size.
- Every card keeps its existing remove control.
- Selecting the same file again does not add another card. A short inline notice
  appears below the attachment strip and disappears after 2.5 seconds.
- Clicking or focusing the `+` attachment control does not add a border, outline,
  shadow, or background highlight.
- Files remain browser-memory objects and are handed to the host only on submit.

## File identity and rejection results

Duplicate identity remains the current stable tuple:
`name + size + lastModified`. `validateIncomingFiles` will return duplicate files
separately from other rejected files so the composer can show a specific
duplicate notice without changing max-count, max-size, or accept filtering.

The validation result becomes:

```ts
interface FileValidationResult {
  accepted: File[]
  duplicates: File[]
  rejectedCount: number
}
```

`rejectedCount` covers size, count, and accept-rule failures only. Duplicate
files are reported through `duplicates` and are not included in that count.

## Type presentation

`filePresentation(file)` returns one of these categories:

- `image`: MIME starts with `image/`; render a thumbnail.
- `pdf`: PDF MIME or `.pdf`; render `file-pdf`.
- `spreadsheet`: CSV and common spreadsheet MIME/extensions; render
  `file-spreadsheet`.
- `archive`: ZIP/RAR/7Z/TAR/GZ MIME/extensions; render `file-archive`.
- `audio`: MIME starts with `audio/`; render `file-audio`.
- `video`: MIME starts with `video/`; render `file-video`.
- `code`: JSON, JavaScript, TypeScript, CSS, HTML, XML, Markdown, Python, shell,
  and common source extensions; render `file-code`.
- `document`: all remaining files; render the existing `file-text` icon.

Missing operation icons are added to `packages/icons/src/data/ui.ts` as
Lucide-style `IconDefinition` entries. The composer continues to render only
`SunIcon`; it does not own SVG markup or import another icon library.

## Component boundaries

- `attachments/files.ts` owns validation, duplicate classification, and the
  stable file key.
- `attachments/filePresentation.ts` owns MIME/extension category mapping and
  icon selection.
- `attachments/ImageAttachmentPreview.tsx` owns one object URL per image file
  and revokes it when the file changes or the preview unmounts.
- `attachments/AttachmentList.tsx` owns the horizontal list, cards, filenames,
  thumbnails, icons, and remove controls.
- `AiComposer.tsx` owns the transient duplicate notice timer and places the
  attachment strip before the textarea.

No public composer prop, handle method, or submit payload changes.

## Visual layout

- The list uses `display: flex`, `flex-wrap: nowrap`, `overflow-x: auto`, and
  `overscroll-behavior-x: contain`.
- Image cards use a compact square thumbnail with a filename overlay/caption and
  an always-available remove button.
- Non-image cards use a compact horizontal card with a fixed icon slot and one
  ellipsized filename line.
- Cards use existing surface, border, muted, text, and radius tokens so light
  and dark themes remain consistent.
- The duplicate notice uses the existing composer notice typography and does
  not affect submit eligibility.

## Accessibility and lifecycle

- The attachment strip keeps an accessible list label.
- Each remove button includes the filename in its accessible name.
- Thumbnails use the filename as alternative text.
- Native horizontal scrolling remains keyboard reachable through the list
  container.
- Object URLs are created only for image files and are always revoked on
  unmount/replacement to avoid memory leaks.
- The duplicate timer is replaced on a new duplicate selection and cleared on
  unmount.

## Verification

- TDD covers duplicate classification separately from other rejections.
- Component tests cover no file-size text, type-specific icons, image thumbnail
  object URL creation/revocation, duplicate notice appearance/disappearance,
  remove behavior, and unchanged submit payloads.
- Icon package checks cover every new icon name and renderer compatibility.
- Browser QA covers mixed attachment categories, a wide overflowing row,
  horizontal scroll metrics, thumbnail rendering, duplicate feedback, removal,
  and the neutral `+` control focus state at the desktop preview viewport.
- Package tests/builds and the complete repository gate must pass before handoff.

# AI Composer Design QA

## Scope

- Reference: `docs/design-qa/ai-composer/chatgpt-work-reference.png`
  (`1192 × 186`, 1× screenshot density).
- Implementation: `docs/design-qa/ai-composer/chatgpt-work-composer-final.png`
  (`940 × 188` crop from the live `/aigc` page at a `1280 × 720` CSS viewport,
  browser DPR `1.5`; the component itself measured `900 × 148` CSS pixels).
- Combined comparison:
  `docs/design-qa/ai-composer/chatgpt-work-composer-comparison.png`.
- Command state:
  `docs/design-qa/ai-composer/chatgpt-work-command-palette.png`.

## Matched state

- Desktop, light theme, empty composer, textarea focused.
- The reference and implementation were reviewed together in the combined
  comparison image.
- The host keeps its own placeholder, model name, and disclaimer copy; the
  reusable component preserves the reference geometry and interaction pattern.
- The host constrains the live composer to `900px`; the package remains
  `width: 100%` and expands to the wider reference container when its consuming
  layout allows it.

## Evidence

- Empty and focused states have identical composer border, background, and
  shadow values.
- Focused textarea computed styles: transparent background, `box-shadow: none`,
  and no visible outline.
- Empty invalid input keeps the submit action disabled without showing an
  inline error.
- Typing `/` opens the searchable command list above the composer with all four
  configured commands; the DOM snapshot exposes the listbox and options.
- The document measured `scrollWidth = clientWidth = 1280`; no desktop
  horizontal overflow was introduced.

## Comparison history

1. Initial live comparison found the composer was `132px` tall and the global
   textarea focus rule still added a blue focus shadow.
2. Increased the composer to `148px`, raised the top inset, matched the `28px`
   corner radius and `40px` submit control, and added an explicit local focus
   reset.
3. Re-captured the focused light-theme state and confirmed identical surface
   styles before and after focus. No P0, P1, or P2 visual issues remain.

final result: passed

## Status feedback and primary action iteration (2026-08-01)

- Reference: `C:/Users/haha/AppData/Local/Temp/codex-clipboard-48f135d7-7758-48ae-ad7e-e29b18e32a0c.png`.
- Live desktop verification used `/aigc` at a `1280 × 720` viewport and
  compared the supplied reference with the implemented composer state.
- The primary action now has three explicit states: disabled, ready, and
  generating. All three measure `40 × 40px`; disabled uses the muted surface,
  ready uses the strong foreground surface, and generating keeps that surface
  while replacing the send icon with a white stop square.
- The generating control remains enabled, exposes `停止生成`, and calls the
  public cancel path. Automated coverage verifies that cancel does not submit
  a second request.
- Host validation feedback now appears in a compact, tinted notice above the
  toolbar instead of occupying a wide line beneath the controls. The live
  attachment rejection measured `12px` text with a `17.4px` line height and
  `role="alert"`.
- Editing the draft clears the stale submission notice. File, speech
  permission, speech recognition, and submission feedback share the same
  reusable notice surface without changing the public submit payload or
  imperative API.
- Browser QA exposed a selector-specificity conflict that reduced the action
  to `34px` and made the ready surface transparent. The scoped primary-action
  selectors now win over the generic toolbar button rules.
- The document retained zero horizontal overflow and the notice did not
  overlap the composer toolbar.

final result: passed

## Attachment strip iteration (2026-08-01)

- Live desktop verification used the `/aigc` page at a `1280 × 720` viewport.
- Three images and two text/code files rendered as three local thumbnails and
  two type-aware icon cards. No file size text was present.
- Five non-image cards stayed in one row: `clientWidth = 867`,
  `scrollWidth = 912`, `flex-wrap = nowrap`, and `overflow-x = auto`.
  Horizontal wheel/trackpad input changed `scrollLeft` from `0` to `45.33`.
- The hidden scrollbar preserved the ChatGPT-like clean surface while the last
  clipped card communicated that more content is available horizontally.
- Re-uploading `package.json` kept one card, showed
  `重复文件：package.json`, and removed the notice after 2.5 seconds.
- The attachment strip is the first composer child and the textarea follows it;
  the `+` trigger resolves to a transparent background with no outline or
  shadow in its scoped focus states.
- Image previews use `object-fit: cover`, remove controls remain visible, and no
  image opens a larger viewer.
- No P0, P1, or P2 visual issues remain in this iteration.

final result: passed

## Model selector popover iteration (2026-08-01)

- Implementation capture:
  `docs/design-qa/ai-composer/model-selector-popover-final.png` at the same
  `1280 × 720` desktop viewport and browser DPR `1.5`.
- Live computed geometry: `220px` popover width, `12px` option and label text,
  `10px` description text, `7px 8px` option padding, and no horizontal
  document overflow (`scrollWidth = clientWidth = 1280`).
- Browser interaction evidence: the popover was open before an outside click
  and closed afterward; Escape closed it, set `aria-expanded="false"`, and
  restored focus to the model trigger. Selecting a model also closed the
  popover and restored trigger focus.
- Automated regression evidence: outside pointer dismissal and Escape focus
  restoration both failed against the previous implementation and pass after
  the scoped listener fix.
- No P0, P1, or P2 issues remain in this iteration.

final result: passed

# ChatGPT-style AIGC shell design QA

Date: 2026-08-30

## Scope and reference

- Rebuilt the `/aigc` shell against the supplied ChatGPT expanded and collapsed
  sidebar references, while retaining Sun World's real routes, account state,
  model selection, conversation history, streaming, attachments, and message
  actions.
- Reference captures:
  `docs/design-qa/chatgpt-shell/reference-expanded-1800x868@2x.png` and
  `docs/design-qa/chatgpt-shell/reference-collapsed-1800x868@2x.png`.
- Final implementation captures:
  `docs/design-qa/chatgpt-shell/implementation-expanded-final-1800x868.jpg` and
  `docs/design-qa/chatgpt-shell/implementation-collapsed-final-1800x868.jpg`.
- Final combined comparison inputs, with the reference on the left and the
  implementation on the right:
  `docs/design-qa/chatgpt-shell/comparison-expanded-final-reference-left.jpg`
  and
  `docs/design-qa/chatgpt-shell/comparison-collapsed-final-reference-left.jpg`.

The source geometry was measured at a 1800 × 868 CSS viewport with device pixel
ratio 2. The final implementation capture used a 1800 × 924 viewport and was
top-cropped to the same 1800 × 868 comparison area; all measured vertical shell
coordinates are unchanged.

## Sidebar refinement comparison

- Source visual truth:
  `docs/design-qa/chatgpt-shell/sidebar-refinement/reference-more-menu-1376x1762.png`.
  The 1376 × 1762 source is a 2× component crop; it was normalized to 688 × 881
  for comparison.
- Final browser-rendered implementation:
  `docs/design-qa/chatgpt-shell/sidebar-refinement/implementation-more-final-1800x924.png`,
  captured at a 1800 × 924 CSS viewport in the logged-out, light-theme,
  expanded-sidebar, More-open state. The capture is 1800 × 924 pixels at 1×.
- Full-view evidence:
  `docs/design-qa/chatgpt-shell/sidebar-refinement/implementation-more-final-1800x924.png`.
- Focused side-by-side evidence:
  `docs/design-qa/chatgpt-shell/sidebar-refinement/comparison-more-final.png`.
  The source is normalized from 2× to 1× and the implementation uses the same
  688 × 881 component crop. A focused crop is required because the source itself
  is a sidebar crop rather than a full browser viewport.
- Collapsed-theme evidence:
  `docs/design-qa/chatgpt-shell/sidebar-refinement/implementation-collapsed-theme-1800x924.png`.

Required fidelity surfaces were checked explicitly. Both use the same system UI
font family and optical hierarchy; the final 36 px menu rhythm, 270 px flyout,
44 px header, 24 px radius, and neutral border/shadow treatment align with the
reference. Colors remain mapped to Sun World light-theme tokens. All visible
menu artwork is vector icon data from `@sun-world/icons`; there are no replaced
or rasterized assets. Menu copy matches the source (`图片`, `地图`, `财务`,
`站点`, `GPT`), while `Sun World` branding and the truthful empty guest history
are intentional product-state differences.

Comparison history:

1. Pass 1 used
   `docs/design-qa/chatgpt-shell/sidebar-refinement/comparison-more-pass1.png`.
   It found a P2 density mismatch: the 48 px rows made the flyout about 60 px
   taller than the normalized source, and the sidebar stack began 8 px too low.
2. The implementation reduced menu rows to 36 px, changed the flyout to 270 px,
   moved it 12 px upward, and reduced the sidebar header from 52 px to 44 px.
3. Pass 2 used
   `docs/design-qa/chatgpt-shell/sidebar-refinement/comparison-more-final.png`.
   The prior density and vertical-offset findings are resolved. No actionable
   P0, P1, or P2 mismatch remains; the slight icon optical-weight difference is
   acceptable P3 polish within the shared Lucide-style icon system.

Primary browser interactions tested: More open/close, Escape focus restoration,
plugin flyout switching, guest role/Skills dialog, MCP guest state, sidebar
collapse/expand, and live light/dark theme switching. The rendered page showed
no visible runtime or interaction error.

## Collapsed-rail brand correction

- Source visual truth:
  `/var/folders/18/5l2c4wxx3cn7157rb1whffsh0000gn/T/codex-clipboard-c65020b5-025b-4c18-8356-9af911920193.png`.
  This 884 × 1008 annotated capture identifies the old top-left sun glyph as
  the incorrect icon.
- Browser-rendered implementation:
  `docs/design-qa/chatgpt-shell/sidebar-brand/implementation-884x1008-light.png`,
  captured in the logged-out, light-theme, collapsed-sidebar state at an
  explicit 884 × 1008 CSS viewport. The screenshot is 884 × 1008 pixels at 1×.
- Full-view combined evidence:
  `docs/design-qa/chatgpt-shell/sidebar-brand/full-comparison-884x1008.png`.
  The two captures have equal pixel dimensions, but the annotated source uses
  a visibly different browser zoom/density, so full-page typography and
  geometry were not treated as precise comparison evidence for this focused
  icon correction.
- Focused combined evidence:
  `docs/design-qa/chatgpt-shell/sidebar-brand/focused-comparison.png`, using
  equal 150 × 170 pixel top-left crops. This is the controlling comparison for
  the marked icon slot.
- Additional state evidence:
  `docs/design-qa/chatgpt-shell/sidebar-brand/implementation-collapsed-dark.png`
  confirms that the brand remains legible in dark mode and the theme control
  remains visually separate at the bottom of the rail.

Comparison history:

1. The user-annotated source identified a P1 semantic mismatch: a sun glyph in
   the top brand/open-sidebar slot was indistinguishable from theme switching.
2. The implementation now supplies the repository's existing `/logo.svg` Sun
   World brand asset in that slot; the reusable AI package falls back to the
   semantic `panel-left-open` icon when no brand is supplied. The bottom rail
   continues to own the real light/dark theme control.
3. The post-fix focused comparison shows a distinct brand mark in the top slot.
   No actionable P0, P1, or P2 mismatch remains.

Required fidelity surfaces were checked. Typography, copy, spacing, and the
neutral rail color tokens are unchanged. The 22 px brand artwork is the real
project vector asset rather than a handcrafted approximation, remains sharp at
1×, and has sufficient contrast in both themes. Browser interaction checks
covered collapse, brand-button expand, and light/dark theme switching. Console
inspection returned no warnings or errors.

## Visual fidelity

| Element | Expanded | Collapsed | Result |
| --- | ---: | ---: | --- |
| Sidebar / rail | 260 px | 52 px | Exact reference widths |
| Main content shift | — | 104 px left | Exact |
| Chat / Work switch | x 922, y 8, 216 × 36 | x 818, y 8, 216 × 36 | Exact |
| Empty-state heading | y 300, h 42 | y 300, h 42 | Exact |
| Composer | x 646, y 364, 768 × 52 | x 542, y 364, 768 × 52 | Exact |
| First suggestion | x 646, y 440, 768 × 52 | x 542, y 440, 768 × 52 | Exact |

- Expanded sidebar structure matches the reference hierarchy: brand and top
  controls, primary navigation, collapsible recent conversations, and account
  footer. The collapsed rail retains the same core actions, uses the real Sun
  World brand mark for its top expand action, and uses its footer for the
  requested working theme toggle.
- Sidebar and main content animate with tokenized transform and opacity motion.
  Intermediate samples showed continuous movement, and both endpoints match
  the reference geometry without a layout-width transition.
- The visible product differences are intentional and truthful: Sun World
  branding replaces ChatGPT branding, the logged-out local state shows no
  fabricated conversation history, and the send action remains unavailable
  until a real model is selected. The requested heading copy remains
  `今天有什么计划？`.
- Desktop expanded, desktop collapsed, and mobile drawer states were reviewed.
  No P0, P1, or P2 visual finding remains.

## Function and accessibility

- New chat, title search, recent-conversation expand/sort/select, model and MCP
  settings, real product navigation, account entry, suggestions, composer,
  attachment handling, streaming, retry, edit, and feedback behavior are wired
  to existing application capabilities.
- Expanding from the collapsed search action, Escape-to-close on mobile, focus
  trapping, focus restoration, inert hidden navigation, landmarks, accessible
  names, and expanded-state semantics are covered.
- Starting a blank conversation now reuses that local draft, preserves it when
  authenticated history arrives, and aborts an active stream only when a truly
  new conversation is created.
- Fresh Chrome console inspection reported no warnings or errors.

## Verification

- Focused Web, AI UI, AI Composer, shared UI, and chat-state tests passed.
- Web, UI, AI UI, and AI Composer typechecks passed.
- Production Web build passed.
- AI interface, public-entry, UI package boundary, icon boundary, theme, and
  motion guards passed.
- Performance budgets passed, including total CSS at `50.0 KiB / 50.0 KiB`.
- Formatting and diff-integrity checks passed after the final documentation
  update.

The previous Manage redesign QA was preserved at
`docs/design-qa/manage/manage-admin-redesign-2026-08-02.md`.

final result: passed

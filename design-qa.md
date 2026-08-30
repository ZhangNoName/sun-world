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
  footer. The collapsed rail retains the same core actions and account entry.
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

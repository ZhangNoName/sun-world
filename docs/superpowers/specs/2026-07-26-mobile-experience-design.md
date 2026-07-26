# Mobile Experience Unification Design

## Goal

Make every Sun World route usable at phone widths, with stable application
chrome, one predictable scroll model, a reusable back-to-top action, and no
drawer or page-level horizontal overflow.

## Scope

- Shared application shell on ordinary routes.
- Home/blog feed and article reading routes.
- Tools, video, game tiles, Keep, account, authoring, and administration pages.
- Full-screen AI and canvas routes, without adding ordinary shell chrome.
- 320px, 390px, and tablet-width responsive behavior.

## Architecture

The application shell owns the page scroll root. Mobile header and bottom
navigation remain inside that root and use sticky positioning, so they stay
available without introducing a second nested page scroller. A layout-level
`BackToTopButton` observes that root, appears after 360px, and respects reduced
motion when returning to the top.

The mobile navigation remains a modal dialog for focus management and escape
handling, but its popup is restyled as a true left-edge, full-height drawer.
Background scrolling stays locked while it is open. The drawer itself owns
overflow when its contents exceed the viewport and includes safe-area padding.

Immersive routes that already hide the header and footer keep their existing
internal scrolling. They do not receive the shell back-to-top control.

## Responsive Rules

- The shell has no horizontal overflow from 320px upward.
- Header and footer controls have at least a 44px touch target.
- Page padding contracts at phone widths without removing visual hierarchy.
- Multi-column tool, video, editor, and administration layouts collapse to one
  column before their content becomes cramped.
- Data tables and intrinsically wide canvases keep scoped horizontal scrolling;
  the document itself does not scroll sideways.
- Images, videos, Markdown tables, and long URLs cannot widen the shell.

## Interaction And Accessibility

- The menu trigger exposes expanded state through the dialog primitive.
- The drawer closes with its close button, Escape, overlay interaction, or a
  route change, and focus returns to the trigger.
- The back-to-top control has the accessible name `返回顶部`, appears only
  after meaningful scrolling, and never covers the mobile navigation.
- Smooth scrolling is disabled when the user requests reduced motion.
- Sticky chrome includes safe-area insets for notched devices.

## Verification

- React tests cover drawer behavior, global back-to-top behavior, and route
  changes.
- Style contract tests guard the single scroll root, sticky mobile chrome,
  drawer geometry, and responsive overflow rules.
- `corepack pnpm check:web` validates tests, types, build, SSG, and budgets.
- Browser QA checks public and authenticated-shell routes at 390x844 and the
  narrowest 320px layout, including scrolling, drawer interaction, route
  navigation, and horizontal overflow.

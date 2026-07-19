# Switchable Sun World and Apple Design Themes

## Goal

Add an Apple-inspired design family without replacing Sun World's identity. Users can switch the complete visual language in one action, choose light, dark, or system appearance, and keep the choice across reloads and browser tabs.

## Product Decisions

- Sun World remains the default design family and continues to own the site's brand.
- Apple is an optional design family inspired by Apple's interface principles, not a pixel-for-pixel copy of an Apple product.
- Design family and color mode are independent dimensions:
  - family: `sun-world` or `apple`
  - mode: `light`, `dark`, or `system`
- The compact header control performs a true one-click skin change between Sun World and Apple while preserving the selected color mode.
- A small theme menu exposes precise family and mode choices. This avoids forcing repeated cycling for users who want a specific state.
- Existing `sun-light` and `sun-dark` stored values are migrated to the Sun World family so current users do not lose their preference.

## Architecture

The theme controller owns a serializable preference object and derives the active appearance from it. It applies stable attributes to the root element:

```text
data-design="sun-world|apple"
data-color-mode="light|dark"
class="sun-light|sun-dark"
```

The legacy classes remain during migration because existing styles and third-party mappings consume them. New theme CSS is selected by the data attributes. Theme state is persisted in local storage and synchronized through the `storage` event. System mode listens to `prefers-color-scheme` changes.

Theme definitions remain CSS-first. Shared semantic tokens describe intent—page, surface, elevated surface, text, border, focus, material, radius, shadow, typography, and motion—while components consume those tokens. Theme-specific selectors only assign tokens and a small number of genuine material behaviors. This keeps application pages independent from theme names.

## Visual Languages

### Sun World

Sun World should feel warm, optimistic, and personal. Its existing blue and teal palette remains recognizable, with clearer surface hierarchy, softer organic radii, restrained colored highlights, and improved typography. It uses less glass than Apple and slightly more visible color in active and selected states.

### Apple

Apple should feel calm, precise, and direct:

- system font stack with optical sizing;
- neutral layered backgrounds and platform-blue accent;
- thin light-catching edges, translucent floating chrome, and depth matched to surface size;
- compact typography with size-specific tracking and leading;
- immediate pointer-down feedback and short, critically damped-feeling transitions;
- bounce only for interactions that actually inherit gesture momentum.

The theme does not add decorative glass everywhere. Translucency is reserved for navigation, menus, dialogs, and floating controls where it communicates hierarchy.

## Interaction and Motion

The one-click control changes design family immediately and announces the resulting family through its accessible label. The theme menu is anchored to that control and uses the same spatial path to enter and exit.

Theme changes use a short color/material transition. If supported, the View Transitions API may provide a subtle localized reveal, but it must remain an enhancement rather than a dependency. Input is never locked while switching.

All interactive controls respond on pointer-down through `:active` feedback. Motion uses compositor-friendly transforms and opacity. `prefers-reduced-motion` removes translation, scaling, and decorative interpolation while preserving short state feedback. `prefers-reduced-transparency` produces solid chrome, and `prefers-contrast: more` increases surface opacity and border contrast.

## Components and Scope

The first complete pass covers the global experience rather than isolated showcase components:

- theme provider and storage migration;
- one-click switch plus precise family/mode menu;
- root page canvas, desktop header, mobile header/footer, and drawer;
- shared UI buttons, inputs, cards/surfaces, dialogs, and focus treatment through semantic tokens;
- home page and common layout surfaces that expose the project's visual identity.

Individual feature pages should inherit the themes through tokens. Feature-specific redesigns that do not block coherent theming remain future work.

## Error Handling and Compatibility

- Invalid or inaccessible stored state falls back to Sun World with system color mode.
- Server-side or test rendering does not access browser globals without guards.
- Browsers without View Transitions, backdrop filters, or transparency media queries receive a solid, fully usable presentation.
- Theme application happens as early as the current app architecture permits to minimize flashes of the wrong theme.

## Testing and Verification

Unit tests cover defaults, legacy migration, persistence, one-click family switching, explicit mode selection, system preference changes, storage synchronization, and restricted storage access. Component tests cover accessible names and menu actions.

Static checks guard the supported theme attributes and required accessibility fallbacks. The normal UI tests, web type checks, format check, and production web build must pass. Visual QA checks both families in light and dark appearances at desktop and mobile widths, including navigation, cards, menus, dialogs, focus states, and reduced-motion behavior.

## Non-Goals

- Copying proprietary Apple assets or reproducing a specific Apple application.
- Adding sound or vibration to ordinary theme changes.
- Reworking every feature page's information architecture in the first pass.
- Introducing a large animation or CSS-in-JS dependency solely for theming.

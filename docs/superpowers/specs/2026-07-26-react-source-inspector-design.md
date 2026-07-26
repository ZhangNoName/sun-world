# React Source Inspector Design

## Goal

Replace the React-19-incompatible `click-to-react-component` integration with a development-only inspector that opens the clicked component source in VS Code.

## Interaction

- Hold `Alt` and click the left mouse button on a rendered application element.
- Highlight the current inspect target while `Alt` is held.
- Open the nearest injected JSX source location in VS Code.
- Preserve normal clicks when `Alt` is not held.

## Architecture

Use `react-dev-inspector` because its Babel transform injects source coordinates at compile time instead of depending on React Fiber's removed `_debugSource` field. Configure its Vite middleware for editor launching and mount a development-only `ReactSourceInspector` wrapper. The wrapper disables the library's toggle hotkey and controls `active` from Alt keydown, keyup, and window blur events so inspection is active only while Alt is held.

## Scope

- Remove `click-to-react-component`.
- Add `react-dev-inspector` and its current Babel/Vite plugin packages as development dependencies.
- Configure the Vite React Babel plugin and inspector development middleware.
- Replace the development-only component in `main.tsx`.
- Add a source-level integration contract and behavior tests for Alt hold/release and focus loss.
- Do not change application components or production behavior.

## Verification

- Contract test fails against the old inspector and passes after replacement.
- Web typecheck and React tests pass.
- Production build passes and does not render the inspector component.
- Manual development verification confirms `Alt + left click` opens VS Code at the selected JSX source.

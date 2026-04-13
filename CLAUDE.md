# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development commands

- Install dependencies: `npm install`
- Start dev server: `npm run dev`
- Build production bundle: `npm run build`
- Preview production build locally: `npm run preview`
- Run lint checks: `npm run lint`

There is currently no automated test setup in `package.json` (no `test` script yet).

## Architecture overview

This is a single-page React app built with Vite (React + JSX, not TypeScript).

- App bootstrap is in `src/main.jsx`, which renders `<App />` inside `React.StrictMode`.
- Most application logic is centralized in `src/App.jsx`.

Core app behavior in `src/App.jsx`:

- **Task/timer model**: Each task stores `durationSec`, `remainingSec`, and `status` (`idle`, `running`, `paused`, `done`). A single `activeTaskId` tracks which task is currently driving the countdown.
- **Timer engine**: A `setInterval` in an effect decrements `remainingSec` every second for the active running task and marks it `done` at zero.
- **Persistence**: App state is stored in `localStorage` under `pomodoro_tasks_v1`; on hydration, running tasks are converted to paused to avoid background drift across reloads.
- **Floating timer window**: A draggable floating panel mirrors the active timer state. Position is clamped to viewport bounds using fixed panel dimensions and persisted with the rest of state.
- **Single-source state flow**: Main panel and floating panel both read/write the same React state, so controls stay synchronized.

## Tooling/config notes

- ESLint uses flat config in `eslint.config.js` with `@eslint/js`, `eslint-plugin-react-hooks`, and `eslint-plugin-react-refresh`; `dist/` is ignored.
- Build/dev config is minimal in `vite.config.js` with only `@vitejs/plugin-react` enabled.
- Existing `README.md` is the default Vite template and does not document project-specific behavior.

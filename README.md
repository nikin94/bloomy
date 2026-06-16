# Bloomy

A single-page web app for managing orders of potted plants and flowers. Sign in
with Google, keep an address book of customers, and create orders with an
itemized plant list, delivery method, and live order totals. The orders list is
searchable by number or customer and filterable by payment/shipment status.

## Tech stack

- **React 19** + **TypeScript** + **Vite** (with the React Compiler enabled)
- **Tailwind CSS v4** for styling
- **React Router v7** for routing
- **Firebase** — Firestore (data) and Authentication (Google sign-in)
- **Zod** for runtime validation of stored documents
- **Yarn 4** (Berry) as the package manager

## Getting started

### Prerequisites

- Node.js 24 (the version pinned in `.nvmrc` and used by CI; 20+ works)
- Yarn 4 (via Corepack: `corepack enable`)
- A Firebase project with Firestore and Google authentication enabled

### Setup

1. Install dependencies:

   ```bash
   yarn install
   ```

2. Create a `.env` file from the example and fill in your Firebase web config
   (Firebase Console → Project settings → Your apps → SDK setup and configuration):

   ```bash
   cp .env.example .env
   ```

   ```
   VITE_FIREBASE_API_KEY=
   VITE_FIREBASE_AUTH_DOMAIN=
   VITE_FIREBASE_PROJECT_ID=
   VITE_FIREBASE_STORAGE_BUCKET=
   VITE_FIREBASE_MESSAGING_SENDER_ID=
   VITE_FIREBASE_APP_ID=
   ```

3. Start the dev server:

   ```bash
   yarn dev
   ```

### Scripts

| Command        | Description                                    |
| -------------- | ---------------------------------------------- |
| `yarn dev`        | Start the Vite dev server with HMR             |
| `yarn build`      | Type-check (`tsc -b`) and build for production |
| `yarn lint`       | Run ESLint                                     |
| `yarn test`       | Run the test suite once                        |
| `yarn test:watch` | Run tests in watch mode                        |
| `yarn coverage`   | Run tests and report coverage                  |
| `yarn test:emulator` | Run emulator-backed data-layer tests        |
| `yarn test:rules` | Run Firestore security-rules tests             |
| `yarn preview`    | Preview the production build locally           |
| `yarn deploy`     | Build and deploy to Firebase Hosting           |
| `yarn deploy:rules` | Deploy Firestore security rules              |

## Testing

Tests run on [Vitest](https://vitest.dev) with [React Testing Library](https://testing-library.com/react)
(jsdom environment). Test files live next to the code they cover as
`*.test.ts(x)`. Run `yarn test` once or `yarn test:watch` while developing.

Data-layer tests come in two flavours:

- **Mock-based** (`src/lib/*.test.ts`) — the Firebase SDK is stubbed, so they
  verify our code (counter math, owner re-check, query shape) fast and offline.
  Part of the default `yarn test` run.
- **Emulator-based** (`src/lib/*.emulator.test.ts`) — run against a real
  Firestore emulator to verify what mocks cannot, e.g. the order-number
  transaction stays atomic under concurrent creates. These need Java and the
  Firebase CLI; run them with `yarn test:emulator` (starts and stops the
  emulator automatically). They are excluded from the default `yarn test`.
- **Security-rules tests** (`src/test/firestore.rules.test.ts`) — run the
  production `firestore.rules` against the emulator via
  `@firebase/rules-unit-testing` to prove the multi-tenant boundary (a user can
  only touch their own documents). Run with `yarn test:rules`.

The emulator runs from `firebase.emulator.json` (no rules — open access) so the
multi-tenant data-layer tests work; the rules tests load `firestore.rules`
themselves. Production rules live in `firestore.rules` and deploy via
`yarn deploy:rules`.

## Deployment

Pushes to `main` deploy automatically to Firebase Hosting via GitHub Actions
(`.github/workflows/firebase-hosting-merge.yml`). The build's `VITE_FIREBASE_*`
values and the Firebase service account are provided as repository secrets.

## Project structure

```
src/
  components/   Reusable UI (AppHeader, Button, Input, Textarea, Select, DataTable, Modal, OrderForm, CustomerForm, SettingsModal, UpdatePrompt, Spinner, ProtectedRoute)
  context/      Auth + settings contexts and providers
  firebase/     Firebase integration: setup and data access (client, auth, orders, customers, settings)
  utils/        Pure helpers, no Firebase (format — money/date formatting, rubles parsing)
  pages/        Route screens (Login, Orders, OrderDetail, NewOrder, EditOrder, Customers)
  styles/       Shared style constants (e.g. fieldStyles — form-control class strings)
  types/        Zod schemas and inferred types (order, customer, settings)
  theme.css     Design tokens (colours, typography, light/dark variants)
  index.css     Tailwind import, base styling, layout
  App.tsx       Routes
  main.tsx      App entry point
```

## Theming

Colours and typography are defined as design tokens in `src/theme.css` — the
single source of truth for the project's palette. Tokens are plain CSS variables
(e.g. `--primary`, the main brand colour) mapped to Tailwind's `--color-*`
namespace via `@theme inline`, so components use semantic utilities (`bg-primary`,
`text-heading`, `border-border`) and never hardcode a colour. To retheme, edit
the values in `theme.css`.

**Dark / light mode.** **Dark is the default.** The active theme is chosen per
user (a sun/moon switch in the settings dialog), persisted to `settings/{uid}`,
and applied by setting `data-theme` on `<html>` — `theme.css` holds the dark
palette in `:root` and the light overrides under `:root[data-theme='light']`. To
avoid a flash of the wrong theme on load, a tiny inline script in `index.html`
sets `data-theme` before first paint from a `localStorage` cache (default dark);
the Firestore setting is the cross-device source of truth and reconciles it once
loaded (see `SettingsProvider`). The OS `prefers-color-scheme` is intentionally
not followed — the default is dark regardless.

## Update prompt (new-version detection)

The build stamps a version (the deploy git SHA via `GITHUB_SHA`, or `dev`
locally) into both the bundle (`__APP_VERSION__`, see `vite.config.ts`) and a
`dist/version.json` file. A long-open tab polls `version.json` (on an interval
and whenever the tab regains focus); when the deployed version differs from the
bundle's, a non-blocking banner offers to reload. `version.json` and
`index.html` are served `no-cache` (so the poll and reload see the new build)
while hashed `/assets/**` stay immutable — see the `headers` in `firebase.json`.

## Data model

- **Orders** and **customers** are stored in Firestore, each scoped to its owner
  (`ownerId`) for multi-tenancy.
- An order references a customer by `customerId`; the customer name is always
  read live from the customers collection (no stored snapshot).
- Money is stored as integer minor units (kopecks) to avoid floating-point
  rounding; subtotal and total are derived from the order's items, not stored.
- Each order also has a human-readable per-owner sequential number, assigned
  atomically on create via a Firestore transaction.

# Bloomy

A single-page web app for running a small potted-plant and flower shop. Sign in
with Google, keep an address book of customers, and create orders with an
itemized plant list, delivery method, and live order totals. The orders list is
searchable by number or customer and filterable by payment/shipment status,
price range and date. Orders carry photos, a soft-delete trash, and a statistics
screen derives business metrics (revenue per currency, status breakdown, orders
per month) entirely in memory.

It is an installable **PWA** that boots and runs **fully offline** (Firestore's
offline cache plus a hand-rolled service worker), ships in **Russian and English**,
and has a **dark/light** theme. Dark is the default.

## Tech stack

- **React 19** + **TypeScript** + **Vite** (with the React Compiler enabled)
- **Tailwind CSS v4** for styling
- **React Router v7** for routing
- **Firebase** — Firestore (data), Authentication (Google + email sign-in) and
  Cloud Storage (order photos)
- **TanStack Query** (server-state cache) and **TanStack Table** (the orders grid)
- **Zod** for runtime validation of stored documents
- **i18next** / react-i18next for localization (Russian + English)
- **Sentry** for error monitoring (opt-in)
- **Vitest** + React Testing Library for tests
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
- **Security-rules tests** (`src/test/firestore.rules.test.ts`,
  `src/test/storage.rules.test.ts`) — run the production `firestore.rules` and
  `storage.rules` against the emulators via `@firebase/rules-unit-testing` to
  prove the multi-tenant boundary (a user can only touch their own documents and
  their own photo files). Run with `yarn test:rules` (starts both the Firestore
  and Storage emulators).

The emulator runs from `firebase.emulator.json` (Firestore open; Storage gets
`storage.rules` because it can't boot without one) so the multi-tenant
data-layer tests work; the rules tests load the rules files themselves.
Production rules live in `firestore.rules` / `storage.rules` and deploy together
via `yarn deploy:rules`.

## Order photos

Orders can carry photos (e.g. a snapshot of the prepared bouquet), managed on
the order detail page. Files are stored in Cloud Storage under
`orders/{ownerId}/{orderId}/{photoId}.jpg`, so `storage.rules` authorizes purely
from the path (uid == ownerId), mirroring the Firestore owner boundary. The
order document stores the storage **paths** (`STORED_ORDER_SCHEMA.photos`), not
download URLs — URLs are resolved lazily and cached for the session. Images are
downscaled client-side (long edge ≤ 1600 px, JPEG) before upload to keep bytes
small on a slow/filtered connection. Note: Cloud Storage has no offline write
queue, so uploads need a live connection (it's Google-hosted, like Auth and
Firestore — see the Crimea-access caveat).

## Deployment

Pushes to `main` deploy automatically to Firebase Hosting via GitHub Actions
(`.github/workflows/firebase-hosting-merge.yml`). The build's `VITE_FIREBASE_*`
values and the Firebase service account are provided as repository secrets.

## Project structure

```
src/
  components/     Reusable UI (AppLayout, Sidebar, Button, Input, Textarea, Select, DataTable, Modal, ConfirmModal, OrderForm, CustomerForm, CustomerEditModal, OrderPhotos, Autocomplete, RangeSlider, SearchControl, OrderFilterControl, Settings, UpdatePrompt, Spinner, ProtectedRoute)
  pages/          Route screens (Login, Orders, OrderDetail, NewOrder, EditOrder, DeletedOrders, Customers, Customer, Stats, Settings)
  context/        Auth + settings contexts and providers, plus header-actions/sidebar contexts
  queries/        TanStack Query hooks + cache writers (orders, customers, keys, queryClient)
  firebase/       Firebase integration: setup and data access (client, auth, orders, customers, settings, photos)
  i18n/           i18next config and locale bundles (ru, en)
  lib/            Small helpers/hooks (cn, useOwnerId, useNow, useMediaQuery, orderLabels, admin, service-worker registration)
  observability/  Sentry setup and error reporting
  utils/          Pure helpers, no Firebase (format — money/date formatting, rubles parsing)
  styles/         Shared style constants (fieldStyles, tableStyles — form/table class strings)
  types/          Zod schemas and inferred types (order, customer, settings, stats)
  test/           Test setup, shared fixtures/factories, rules & emulator harnesses
  routes.tsx      Route tree
  theme.css       Design tokens (colours, typography, light/dark variants)
  index.css       Tailwind import, base styling, layout
  App.tsx         App shell (providers)
  main.tsx        App entry point
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

## Offline (service worker)

A tiny hand-rolled service worker (`/sw.js`, generated at build time by the
`emit-service-worker` plugin in `vite.config.ts`; source builder in `vite.sw.ts`)
precaches the app shell — `index.html`, every hashed JS/CSS chunk, `version.json`
and the icons — so the app **boots and runs fully offline on a cold start**, not
just while a tab stays open. It is registered only in a production build
(`src/lib/registerServiceWorker.ts`); dev keeps HMR.

Behaviour: navigations fall back to the cached shell when offline; same-origin
hashed assets are cache-first (and runtime-cached on first online use);
`version.json` is network-first so update detection stays honest; **everything
else — Firestore, Google auth, any cross-origin or non-GET request — passes
straight to the network**, so Firestore's own offline persistence is never
disturbed. Each deploy bakes a new version into the SW, so a new cache replaces
the old one on activate (old caches are deleted), in lockstep with the update
prompt above. `sw.js` is served `no-cache` so a new SW is never pinned by the CDN.

**Kill switch (brick-safety):** if a bad SW ever needs disabling, post
`{ type: 'BLOOMY_SW_KILL' }` to it (it unregisters and clears its caches), or
deploy a `sw.js` whose `install` calls `self.registration.unregister()` — the
standard remote escape hatch, since browsers re-fetch `sw.js` (served `no-cache`)
on navigation.

## Data model

- **Orders** and **customers** are stored in Firestore, each scoped to its owner
  (`ownerId`) for multi-tenancy.
- An order references a customer by `customerId`; the customer name is always
  read live from the customers collection (no stored snapshot).
- Money is stored as integer minor units (kopecks) to avoid floating-point
  rounding; subtotal and total are derived from the order's items, not stored.
- Each order also has a human-readable per-owner sequential number, assigned
  atomically on create via a Firestore transaction.

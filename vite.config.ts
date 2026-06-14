import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { configDefaults } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    babel({ presets: [reactCompilerPreset()] })
  ],
  // Vitest config. `globals: false` keeps the test API explicit (imported from
  // 'vitest'), matching the codebase's explicit-imports style; the setup file
  // wires jest-dom matchers and React Testing Library cleanup in their place.
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
    // Emulator-backed tests need a running Firestore emulator, so they are run
    // separately via `yarn test:emulator` (vitest.emulator.config.ts), not here.
    exclude: [...configDefaults.exclude, '**/*.emulator.test.ts'],
  },
})

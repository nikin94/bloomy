import { describe, it, expect } from 'vitest'
// Vite `?raw` imports (no node:fs — the app tsconfig has no node types): the
// test sees the same source bytes the build ships. Parent-relative on purpose:
// both files live at the REPO ROOT, above src/, which the `@/` alias (= src/)
// cannot reach — the no-parent-imports rule exists for cross-SRC imports.
/* eslint-disable @typescript-eslint/no-restricted-imports */
import indexHtml from '../../index.html?raw'
import firebaseJson from '../../firebase.json?raw'
/* eslint-enable @typescript-eslint/no-restricted-imports */

// Keeps firebase.json's CSP script-src hash in lockstep with index.html's ONE
// inline script (the no-flash theme/lang bootstrap). The header allows exactly
// that script by sha256 instead of 'unsafe-inline'; editing the script without
// re-hashing would silently break the bootstrap in production (the browser
// refuses to run it → theme/lang flash), so this test recomputes the hash from
// the source and fails loudly right here instead. Vite copies the inline script
// into dist byte-identical (verified when the hash was introduced), so hashing
// the SOURCE html is hashing what ships.
describe('CSP inline-script hash', () => {
  it('firebase.json allows exactly the inline script index.html carries', async () => {
    // Inline scripts only: a <script> tag with no src attribute.
    const inline = [...indexHtml.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(
      (m) => m[1],
    )
    // The bootstrap is deliberately the ONLY inline script — a second one would
    // need its own hash added to the header (and a reason to exist).
    expect(inline).toHaveLength(1)

    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(inline[0]))
    const hash = btoa(String.fromCharCode(...new Uint8Array(digest)))

    const headers = (
      JSON.parse(firebaseJson) as {
        hosting: { headers: { headers: { key: string; value: string }[] }[] }
      }
    ).hosting.headers.flatMap((h) => h.headers)
    const csp = headers.find((h) => h.key === 'Content-Security-Policy')!.value

    const scriptSrc = csp.split(';').find((d) => d.trim().startsWith('script-src'))!
    expect(scriptSrc).toContain(`'sha256-${hash}'`)
    // The hash is the point — 'unsafe-inline' must not sneak back beside it.
    expect(scriptSrc).not.toContain('unsafe-inline')
  })
})

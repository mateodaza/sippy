/**
 * Local type shim for `@pimlico/webhook` 0.0.6.
 *
 * The published package sets `"types": "./_types/index.d.ts"` but ships no such
 * file, so under nodenext TS falls back to compiling the package's `.ts` source
 * (extensionless re-exports → errors). We import the built ESM entry directly
 * (`@pimlico/webhook/_esm/index.js` — Node resolves it; the package has no
 * `exports` map blocking subpaths) and declare its surface here. No tsconfig
 * `paths`/`baseUrl` (those break the SWC transpiler). Keep in sync with the
 * package if its surface changes.
 */

declare module '@pimlico/webhook/_esm/index.js' {
  /** Build a verifier bound to a Pimlico webhook secret (svix under the hood). */
  export function pimlicoWebhookVerifier(
    webhookSecret: string
  ): (headers: Record<string, string | string[] | undefined>, payload: string) => any

  /** Recursively decode a UserOperation callData into its underlying calls. */
  export function parseCallData(
    callData: string
  ): Array<{ to: string; value: bigint; data: string }>
}

/**
 * Runs once at server startup (before any request is handled).
 *
 * This dev machine's IPv6 route to the upstream host is unreachable, and Node's
 * fetch (undici) resolves AAAA (IPv6) first — causing ETIMEDOUT on server-side
 * requests (GraphQL proxy and the next/image optimizer). Preferring IPv4
 * process-wide fixes both. Harmless where IPv6 works (still prefers IPv4).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { setDefaultResultOrder } = await import("node:dns");
    setDefaultResultOrder("ipv4first");
  }
}

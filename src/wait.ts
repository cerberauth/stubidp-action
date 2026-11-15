/**
 * Polls the OpenID Connect discovery endpoint until it answers, then returns
 * the parsed provider metadata.
 */
export async function waitForReady(
  url: string,
  timeoutMs = 30000,
  intervalMs = 500
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok) return (await res.json()) as Record<string, unknown>
    } catch {
      // not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  throw new Error(`stubidp did not become ready within ${timeoutMs}ms`)
}

export async function waitForReady(
  url: string,
  timeoutMs = 30000,
  intervalMs = 500
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {
      // not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  throw new Error(`stubidp did not become ready within ${timeoutMs}ms`)
}

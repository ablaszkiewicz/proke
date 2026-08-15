/**
 * The webhook controller acknowledges GitHub before doing the work, so assertions have to
 * wait for the detached handler rather than assuming it ran by the time the response landed.
 */
export async function waitFor(
  condition: () => boolean,
  // Generous on purpose: it returns the moment the condition holds, so a high ceiling costs
  // nothing in the happy path and removes the timeout as a source of false failures.
  { timeoutMs = 5000, intervalMs = 10 } = {},
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (condition()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error('Timed out waiting for condition');
}

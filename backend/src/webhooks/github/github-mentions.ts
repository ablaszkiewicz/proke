/**
 * GitHub handles: 1-39 characters, alphanumeric or single hyphens, never starting or ending
 * with one. The leading group keeps `foo@bar` and `.../@baz` from reading as mentions.
 */
const MENTION_PATTERN = /(?:^|[^\w@/-])@([a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38})/gi;

// Fenced blocks first, so an inline-code pass cannot chew through their contents.
const FENCED_CODE = /```[\s\S]*?```|~~~[\s\S]*?~~~/g;
const INLINE_CODE = /`[^`\n]*`/g;

/**
 * Pulls the @handles out of a comment body.
 *
 * Code is stripped before matching, matching what GitHub itself does - an `@param` in a
 * snippet, or a docs example showing an email, is not somebody asking for you. Team mentions
 * (`@org/team`) are skipped too: they name a group we cannot resolve to a person, and treating
 * the org half as a user would poke whoever happens to share that handle.
 */
export function extractMentionedLogins(body: string | null | undefined): string[] {
  if (!body) {
    return [];
  }

  const text = body.replace(FENCED_CODE, ' ').replace(INLINE_CODE, ' ');
  const logins: string[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(MENTION_PATTERN)) {
    const login = match[1];
    const nextCharacter = text[(match.index ?? 0) + match[0].length];

    if (nextCharacter === '/') {
      continue;
    }

    // GitHub treats handles case-insensitively; the same person mentioned twice is one poke.
    const key = login.toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    logins.push(login);
  }

  return logins;
}

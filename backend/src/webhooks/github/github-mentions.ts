/**
 * GitHub handles: 1-39 characters, alphanumeric or single hyphens, never starting or ending
 * with one. The leading group keeps `foo@bar` and `.../@baz` from reading as mentions.
 *
 * The optional second half is a team slug. A slug we get slightly wrong resolves to no team on
 * GitHub's side and pokes nobody, which is the right way round for a guess to fail.
 */
const MENTION_PATTERN =
  /(?:^|[^\w@/-])@([a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38})(?:\/([a-z\d](?:[a-z\d_-]{0,97}[a-z\d])?))?/gi;

// Fenced blocks first, so an inline-code pass cannot chew through their contents.
const FENCED_CODE = /```[\s\S]*?```|~~~[\s\S]*?~~~/g;
const INLINE_CODE = /`[^`\n]*`/g;

export interface MentionedTeam {
  org: string;
  slug: string;
  /** `org/team` - what a message says when it explains which team was named. */
  handle: string;
}

export interface Mentions {
  logins: string[];
  teams: MentionedTeam[];
}

/**
 * Pulls the @handles and @org/teams out of a comment body.
 *
 * Code is stripped before matching, matching what GitHub itself does - an `@param` in a snippet,
 * or a docs example showing an email, is not somebody asking for you.
 *
 * The two are parsed together so that a team never reads as the user holding the org handle:
 * `@acme/reviewers` would otherwise poke a stranger called acme every time.
 */
export function extractMentions(body: string | null | undefined): Mentions {
  if (!body) {
    return { logins: [], teams: [] };
  }

  const text = body.replace(FENCED_CODE, ' ').replace(INLINE_CODE, ' ');
  const logins: string[] = [];
  const teams: MentionedTeam[] = [];
  // GitHub treats both case-insensitively; the same person or team named twice is one poke.
  const seen = new Set<string>();

  for (const match of text.matchAll(MENTION_PATTERN)) {
    const [matched, login, slug] = match;
    const nextCharacter = text[(match.index ?? 0) + matched.length];

    // A slash we did not consume: `@acme/`, or a path like `@acme/team/extra`.
    if (nextCharacter === '/') {
      continue;
    }

    const key = (slug ? `team:${login}/${slug}` : `user:${login}`).toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);

    if (slug) {
      teams.push({ org: login, slug, handle: `${login}/${slug}` });
    } else {
      logins.push(login);
    }
  }

  return { logins, teams };
}

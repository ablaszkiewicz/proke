export class SlackWorkspaceNormalized {
  id: string;
  teamId: string;
  teamName: string;
  botUserId: string;
  botScopes?: string;
  installedByUserId?: string;
  revokedAt?: Date;
}

/**
 * The workspace plus its decrypted token. Server-side only, and separate from the shape above
 * on purpose: everything that does not need to post is handed the token-less one, so a leak
 * has to be deliberate rather than accidental.
 */
export class SlackWorkspaceWithToken extends SlackWorkspaceNormalized {
  botToken: string;
}

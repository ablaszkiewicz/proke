import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Connecting Slack is two separate acts, and this is which of them is still outstanding.
 *
 * Splitting them is what keeps the common case to one click: only the first person in a
 * workspace ever sees `workspace_missing`, and only they have to involve an admin.
 */
export enum SlackConnectionStatus {
  /** We do not know who this person is in Slack. */
  Unlinked = 'unlinked',
  /** We know who they are, but proke is not in that workspace and cannot message them. */
  WorkspaceMissing = 'workspace_missing',
  Linked = 'linked',
}

export class SlackConnectionResponse {
  @ApiProperty({ enum: SlackConnectionStatus })
  status: SlackConnectionStatus;

  @ApiPropertyOptional()
  teamId?: string;

  @ApiPropertyOptional()
  teamName?: string;

  @ApiPropertyOptional()
  slackHandle?: string;

  /** Sign in with Slack. Identity only, so no admin is ever involved. */
  @ApiProperty()
  connectUrl: string;

  /** Present only when the workspace needs the bot added; may require an admin's approval. */
  @ApiPropertyOptional()
  installUrl?: string;

  /** False when the server has no Slack credentials, so the UI can say so instead of failing. */
  @ApiProperty()
  configured: boolean;
}

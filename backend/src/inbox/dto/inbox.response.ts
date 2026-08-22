import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InboxSectionKey } from '../core/entities/inbox.interface';

export class InboxAuthorResponse {
  @ApiProperty()
  login: string;

  @ApiPropertyOptional()
  avatarUrl?: string;
}

export class InboxPullRequestResponse {
  @ApiProperty({ description: "GitHub's node id. Survives a repository or author rename." })
  id: string;

  @ApiProperty()
  number: number;

  @ApiProperty()
  title: string;

  @ApiProperty({ description: 'The html_url. Where a row links to.' })
  url: string;

  @ApiProperty()
  isDraft: boolean;

  @ApiProperty({ description: "GitHub's numeric repository id, as a string" })
  repositoryId: string;

  @ApiProperty({ description: 'owner/name' })
  repositoryFullName: string;

  @ApiProperty({ type: InboxAuthorResponse })
  author: InboxAuthorResponse;
}

export class InboxSectionResponse {
  @ApiProperty({
    enum: InboxSectionKey,
    description: 'The client owns the heading; the server owns which pile a row is in.',
  })
  key: InboxSectionKey;

  @ApiProperty({
    type: InboxPullRequestResponse,
    isArray: true,
    description: 'Server-ordered. Render in the order given.',
  })
  pullRequests: InboxPullRequestResponse[];
}

/**
 * One person's inbox as of one moment, plus enough about that moment for the client to be
 * honest about what it is showing.
 *
 * Every section is present even when empty, so finishing the last thing in a pile does not make
 * its heading disappear and reshuffle the page underneath the reader.
 */
export class InboxResponse {
  @ApiPropertyOptional({
    description:
      'When GitHub last answered, ISO 8601. Absent only when it never has for this user.',
  })
  refreshedAt?: string;

  @ApiProperty({
    description:
      'True when this is an older snapshot served because the refresh behind it failed. The ' +
      'rows are real, they are just not current.',
  })
  stale: boolean;

  @ApiProperty({
    description:
      'The stored GitHub authorization is gone or was revoked. Nothing can be refreshed until ' +
      'the user reconnects. Deliberately not a 401 - the proke session is perfectly good.',
  })
  githubReauthRequired: boolean;

  @ApiProperty({ type: InboxSectionResponse, isArray: true })
  yours: InboxSectionResponse[];

  @ApiProperty({ type: InboxSectionResponse, isArray: true })
  waitingOnYou: InboxSectionResponse[];
}

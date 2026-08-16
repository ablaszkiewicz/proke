import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class GithubLoginBody {
  /** The one-time code GitHub put on the redirect. */
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  githubCode: string;
}

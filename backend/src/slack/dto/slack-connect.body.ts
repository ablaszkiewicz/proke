import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class SlackConnectBody {
  /** The one-time code Slack put on the redirect. */
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  code: string;

  /** Handed out when the authorize URL was built; ties this callback to this user. */
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  state: string;
}

import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUserId } from '../../auth/core/decorators/current-user-id.decorator';
import { UserReadService } from '../read/user-read.service';
import { UserSerialized } from './entities/user.interface';
import { UserSerializer } from './entities/user.serializer';

@Controller('users')
@ApiTags('Users')
@ApiBearerAuth()
export class UserCoreController {
  constructor(private readonly userReadService: UserReadService) {}

  @Get('me')
  @ApiResponse({ type: UserSerialized })
  public async readCurrentUser(@CurrentUserId() userId: string): Promise<UserSerialized> {
    const user = await this.userReadService.readByIdOrThrow(userId);

    return UserSerializer.serialize(user);
  }
}

import { Controller, Delete, Get, HttpCode } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUserId } from '../../auth/core/decorators/current-user-id.decorator';
import { UserReadService } from '../read/user-read.service';
import { UserSerialized } from './entities/user.interface';
import { UserSerializer } from './entities/user.serializer';
import { UserDeletionService } from './user-deletion.service';

@Controller('users')
@ApiTags('Users')
@ApiBearerAuth()
export class UserCoreController {
  constructor(
    private readonly userReadService: UserReadService,
    private readonly userDeletionService: UserDeletionService,
  ) {}

  @Get('me')
  @ApiResponse({ type: UserSerialized })
  public async readCurrentUser(@CurrentUserId() userId: string): Promise<UserSerialized> {
    const user = await this.userReadService.readByIdOrThrow(userId);

    return UserSerializer.serialize(user);
  }

  /**
   * Deletes this account and everything proke holds because of it - subscriptions, Slack
   * identities, the stored GitHub token. Irreversible and immediate; there is no soft delete.
   *
   * Scoped to the caller's own id and nobody else's, so there is no id to pass and no way to
   * aim it at another account.
   */
  @Delete('me')
  @HttpCode(204)
  public async deleteCurrentUser(@CurrentUserId() userId: string): Promise<void> {
    await this.userDeletionService.deleteAccount(userId);
  }
}

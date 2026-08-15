import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUserId } from '../auth/core/decorators/current-user-id.decorator';
import { ConnectionsService } from './connections.service';
import {
  ConnectionsResponse,
  NotificationPreferencesResponse,
} from './dto/connection.response';
import { UpdateNotificationPreferencesBody } from './dto/update-notification-preferences.body';

@Controller('connections')
@ApiTags('Connections')
@ApiBearerAuth()
export class ConnectionsController {
  constructor(private readonly connectionsService: ConnectionsService) {}

  @Get()
  @ApiResponse({ type: ConnectionsResponse })
  public async readConnections(@CurrentUserId() userId: string): Promise<ConnectionsResponse> {
    return this.connectionsService.readForUser(userId);
  }

  @Post(':installationId/subscription')
  @HttpCode(204)
  public async subscribe(
    @CurrentUserId() userId: string,
    @Param('installationId') installationId: string,
  ): Promise<void> {
    await this.connectionsService.subscribe(userId, installationId);
  }

  @Delete(':installationId/subscription')
  @HttpCode(204)
  public async unsubscribe(
    @CurrentUserId() userId: string,
    @Param('installationId') installationId: string,
  ): Promise<void> {
    await this.connectionsService.unsubscribe(userId, installationId);
  }

  /**
   * Replaces what this user wants out of an installation: which repositories, and which kinds
   * of event within them. The UI writes the defaults and shows them read-only for now; the
   * shape is already the full one.
   */
  @Put(':installationId/preferences')
  @ApiResponse({ type: NotificationPreferencesResponse })
  public async updatePreferences(
    @CurrentUserId() userId: string,
    @Param('installationId') installationId: string,
    @Body() body: UpdateNotificationPreferencesBody,
  ): Promise<NotificationPreferencesResponse> {
    return this.connectionsService.updatePreferences(userId, installationId, body);
  }

  /** Removes the app from the account entirely, for everyone. Owners only. */
  @Delete(':installationId')
  @HttpCode(204)
  public async uninstall(
    @CurrentUserId() userId: string,
    @Param('installationId') installationId: string,
  ): Promise<void> {
    await this.connectionsService.uninstall(userId, installationId);
  }
}

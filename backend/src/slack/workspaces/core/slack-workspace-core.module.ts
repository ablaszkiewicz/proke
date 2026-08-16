import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SlackWorkspaceEntity, SlackWorkspaceSchema } from './entities/slack-workspace.entity';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: SlackWorkspaceEntity.name, schema: SlackWorkspaceSchema }]),
  ],
  exports: [MongooseModule],
})
export class SlackWorkspaceCoreModule {}

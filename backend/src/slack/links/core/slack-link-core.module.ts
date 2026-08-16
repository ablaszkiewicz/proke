import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SlackLinkEntity, SlackLinkSchema } from './entities/slack-link.entity';

@Module({
  imports: [MongooseModule.forFeature([{ name: SlackLinkEntity.name, schema: SlackLinkSchema }])],
  exports: [MongooseModule],
})
export class SlackLinkCoreModule {}

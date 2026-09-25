import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AnnouncementStoreService } from './announcement-store.service';
import {
  AnnouncementDeliveryEntity,
  AnnouncementDeliverySchema,
} from './entities/announcement-delivery.entity';
import { AnnouncementRunEntity, AnnouncementRunSchema } from './entities/announcement-run.entity';

/** Apart from the sender, so deleting an account can clear its rows without the whole runner. */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AnnouncementRunEntity.name, schema: AnnouncementRunSchema },
      { name: AnnouncementDeliveryEntity.name, schema: AnnouncementDeliverySchema },
    ]),
  ],
  providers: [AnnouncementStoreService],
  exports: [AnnouncementStoreService],
})
export class AnnouncementStoreModule {}

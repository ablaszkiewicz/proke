import { Module } from '@nestjs/common';
import { NotificationDeliveryService } from '../delivery/notification-delivery.service';

@Module({
  providers: [NotificationDeliveryService],
  exports: [NotificationDeliveryService],
})
export class NotificationsCoreModule {}

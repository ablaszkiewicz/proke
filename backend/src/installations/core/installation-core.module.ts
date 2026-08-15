import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InstallationEntity, InstallationSchema } from './entities/installation.entity';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: InstallationEntity.name, schema: InstallationSchema }]),
  ],
  exports: [MongooseModule],
})
export class InstallationCoreModule {}

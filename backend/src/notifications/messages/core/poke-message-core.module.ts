import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { InjectModel, MongooseModule } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PokeMessageEntity, PokeMessageSchema } from './entities/poke-message.entity';

/**
 * The index that kept one row per person per pull request, back when a second message replaced
 * the first. The schema no longer declares it, but nothing drops an index on its own - and while
 * it stands, the second message's row is refused and the first message is the only one edited.
 */
const LEGACY_POKE_MESSAGE_INDEX = 'userId_1_repositoryFullName_1_pullRequestNumber_1';

/** What dropping an index that is already gone says - or the collection it would be on. */
const ALREADY_GONE = ['IndexNotFound', 'NamespaceNotFound'];

@Module({
  imports: [
    MongooseModule.forFeature([{ name: PokeMessageEntity.name, schema: PokeMessageSchema }]),
  ],
  exports: [MongooseModule],
})
export class PokeMessageCoreModule implements OnModuleInit {
  private readonly logger = new Logger(PokeMessageCoreModule.name);

  constructor(
    @InjectModel(PokeMessageEntity.name) private messageModel: Model<PokeMessageEntity>,
  ) {}

  /**
   * Drops the one-row-per-person index on every start. Gone after the first, which makes every
   * later run a no-op - and a failure is only logged, because a poke that edits one message
   * instead of two is not worth refusing to start over.
   *
   * Safe to delete, along with the index name, once every database has started on this once.
   */
  public async onModuleInit(): Promise<void> {
    try {
      await this.messageModel.collection.dropIndex(LEGACY_POKE_MESSAGE_INDEX);
      this.logger.log(`Dropped the legacy index ${LEGACY_POKE_MESSAGE_INDEX}`);
    } catch (error) {
      if (!ALREADY_GONE.includes((error as { codeName?: string })?.codeName ?? '')) {
        this.logger.warn(`Could not drop the legacy index ${LEGACY_POKE_MESSAGE_INDEX}: ${error}`);
      }
    }
  }
}

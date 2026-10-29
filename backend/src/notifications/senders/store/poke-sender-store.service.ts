import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage } from 'mongoose';
import { InMemoryCacheService } from '../../../shared/cache/in-memory-cache.service';
import { GithubAccount, looksLikeBot, normalizeAccountLogin } from '../../core/bot-accounts';
import { GithubNotificationNormalized } from '../../core/entities/github-notification.interface';
import { pieceOf } from '../../delivery/review-batch.service';
import {
  POKE_SENDERS_MAX,
  POKE_SENDERS_WINDOW_SECONDS,
  PokeSendersEntity,
} from './entities/poke-senders.entity';

/** Whether a poke reached somebody, or their bot settings kept it back. */
export type PokeSenderOutcome = 'reached' | 'held';

/** One account that has poked somebody lately, as read. */
export interface PokeSender {
  login: string;
  bot: boolean;
  reached: number;
  held: number;
  lastPokedAt: Date;
}

const WINDOW_MS = POKE_SENDERS_WINDOW_SECONDS * 1000;

/**
 * How long one piece of a review, or of a review request, is remembered as already counted.
 * Far longer than the batch window the pieces arrive in, and gone long before anything could
 * reuse the id.
 */
const PIECE_TTL_MS = 10 * 60_000;

/**
 * Who has been poking each person, and how much: what the bots dialog suggests from.
 *
 * Bounded by person rather than by poke - see PokeSendersEntity - and best-effort throughout.
 * A count is never worth a poke, so nothing here throws: a write that fails is a count lost
 * and a line in the log.
 */
@Injectable()
export class PokeSenderStoreService {
  private readonly logger = new Logger(PokeSenderStoreService.name);

  constructor(
    @InjectModel(PokeSendersEntity.name) private sendersModel: Model<PokeSendersEntity>,
    private readonly cache: InMemoryCacheService,
  ) {}

  /**
   * One more poke from `account` to this person, sent or kept back.
   *
   * Once per poke rather than once per webhook: a review with twenty inline comments is twenty
   * one webhooks and one poke, and counted per webhook the bots that comment the most would
   * outrank everybody by an order of magnitude for saying the same thing once. The pieces are
   * told apart the way the batch tells them apart, and once per outcome, since a bot's approval
   * can reach somebody while the comments that came with it are kept back.
   *
   * In one atomic write, read nothing first: forget whoever is a month stale, bump the account
   * or add it, and when the list is full drop the least-poked person to make the room. People
   * before bots, because the bots are what the list is read for - see PokeSendersEntity.
   */
  public async record(
    userId: string,
    account: GithubAccount | undefined,
    outcome: PokeSenderOutcome,
    notification: GithubNotificationNormalized,
  ): Promise<void> {
    const login = normalizeAccountLogin(account?.login ?? '');

    if (!login) {
      return;
    }

    const piece = pieceOf(notification);

    if (piece) {
      const key = `poke-senders:${userId}:${outcome}:${piece.kind}:${piece.id}`;

      if (this.cache.get<boolean>(key)) {
        return;
      }

      this.cache.set(key, true, PIECE_TTL_MS);
    }

    try {
      await this.sendersModel
        .updateOne(
          { userId },
          countingPipeline(login, looksLikeBot(account), outcome, new Date()),
          // Mongoose refuses an array here unless told it is meant as a pipeline.
          { upsert: true, updatePipeline: true },
        )
        .exec();
    } catch (error) {
      this.logger.warn(`Could not count a poke from ${login} for ${userId}: ${error}`);
    }
  }

  /**
   * Everybody who has poked this person in the last month, most first.
   *
   * Filtered by date here as well as on every write, because a row nothing has written to lately
   * still holds whatever it held until the TTL monitor gets to it.
   */
  public async read(userId: string): Promise<PokeSender[]> {
    const row = await this.sendersModel
      .findOne({ userId })
      .select({ senders: 1 })
      .lean<Pick<PokeSendersEntity, 'senders'>>()
      .exec();
    const since = Date.now() - WINDOW_MS;

    return (row?.senders ?? [])
      .filter((sender) => sender.lastAt.getTime() >= since)
      .sort((a, b) => b.count - a.count || b.lastAt.getTime() - a.lastAt.getTime())
      .map((sender) => ({
        login: sender.login,
        bot: sender.bot,
        reached: sender.count - sender.held,
        held: sender.held,
        lastPokedAt: sender.lastAt,
      }));
  }

  public async deleteForUser(userId: string): Promise<void> {
    await this.sendersModel.deleteOne({ userId }).exec();
  }
}

/**
 * The counting write, as an update pipeline so that reading the list, deciding and writing it
 * back are one operation the server does - two pokes landing together cannot both add the same
 * account, or both take the last free place.
 *
 * Every constant goes in as a `$literal`: a string starting with `$` is a field path to the
 * aggregation language, and the login came off a payload - and a bare `true` or `1` in an object
 * reads as "keep this field" in some stages, which is not a thing to rely on a stage not doing.
 */
function countingPipeline(
  login: string,
  bot: boolean,
  outcome: PokeSenderOutcome,
  now: Date,
): PipelineStage[] {
  const since = new Date(now.getTime() - WINDOW_MS);
  const held = outcome === 'held' ? 1 : 0;
  const literal = { $literal: login };

  return [
    {
      $set: {
        senders: {
          $filter: {
            input: { $ifNull: ['$senders', []] },
            cond: { $gte: ['$$this.lastAt', since] },
          },
        },
      },
    },
    {
      $set: {
        senders: {
          $cond: [
            { $in: [literal, '$senders.login'] },
            {
              $map: {
                input: '$senders',
                in: {
                  $cond: [
                    { $eq: ['$$this.login', literal] },
                    {
                      login: literal,
                      bot: { $literal: bot },
                      count: { $add: ['$$this.count', 1] },
                      held: { $add: ['$$this.held', held] },
                      lastAt: now,
                    },
                    '$$this',
                  ],
                },
              },
            },
            {
              // Bots first, then the most poking, then the most recent - and everything past
              // the place the newcomer needs falls off the end. So the one dropped is the
              // quietest person, longest ago, and a bot only once nobody else is left.
              $concatArrays: [
                {
                  $slice: [
                    {
                      $sortArray: {
                        input: '$senders',
                        sortBy: { bot: -1, count: -1, lastAt: -1 },
                      },
                    },
                    POKE_SENDERS_MAX - 1,
                  ],
                },
                [
                  {
                    login: literal,
                    bot: { $literal: bot },
                    count: { $literal: 1 },
                    held: { $literal: held },
                    lastAt: now,
                  },
                ],
              ],
            },
          ],
        },
        updatedAt: now,
      },
    },
  ] as PipelineStage[];
}

import { createHmac } from 'crypto';
import * as request from 'supertest';
import { NotificationType } from '../../src/notifications/core/entities/notification-type.enum';
import { POKE_SENDERS_MAX } from '../../src/notifications/senders/store/entities/poke-senders.entity';
import { createTestApp } from '../utils/bootstrap';
import { waitFor } from '../utils/wait-for';

const WEBHOOK_SECRET = 'test-webhook-secret';

/**
 * Who has been poking somebody: counted by the webhook router, read by the bots dialog.
 *
 * What reaches people, and what does not, is the webhook spec's business. These are about what
 * gets counted against whom, and about the one row per person staying the size it is meant to.
 */
describe('Poke senders', () => {
  let bootstrap: Awaited<ReturnType<typeof createTestApp>>;
  let deliverSpy: jest.SpyInstance;

  beforeAll(async () => {
    process.env.GH_APP_WEBHOOK_SECRET = WEBHOOK_SECRET;
    bootstrap = await createTestApp();
  });

  beforeEach(async () => {
    await bootstrap.methods.beforeEach();
    deliverSpy = jest
      .spyOn(bootstrap.services.notificationDeliveryService, 'deliver')
      .mockResolvedValue(undefined);
  });

  // A review is held open for a moment before it goes, so one a test sent can otherwise land in
  // the next test's spy.
  afterEach(async () => {
    await bootstrap.services.reviewBatchService.flushAll();
    deliverSpy.mockRestore();
  });

  afterAll(async () => {
    await bootstrap.methods.afterAll();
  });

  const INSTALLATION_ID = '5150';
  const REPOSITORY = { id: 314, full_name: 'ablaszkiewicz/proke', private: false };
  const MARCUS = { id: 4242, login: 'marcus', type: 'User' };
  const NICO = { id: 7070, login: 'nico', type: 'User' };
  const STAMPHOG = { id: 6060, login: 'stamphog[bot]', type: 'Bot' };
  const RELEASE_BOT = { id: 3131, login: 'release-bot', type: 'User' };

  const send = (event: string, payload: object) => {
    const body = JSON.stringify(payload);
    const signature = 'sha256=' + createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');

    return request(bootstrap.app.getHttpServer())
      .post('/webhooks/github')
      .set('content-type', 'application/json')
      .set('x-github-event', event)
      .set('x-hub-signature-256', signature)
      .send(body);
  };

  const readSenders = (token: string) =>
    request(bootstrap.app.getHttpServer())
      .get('/notifications/senders')
      .set('authorization', `Bearer ${token}`);

  /** marcus, listening to the one installation, with whatever bot settings the test wants. */
  const setupMarcus = async (pokeSettings: object = {}) => {
    const { user, token } = await bootstrap.utils.authUtils.setupUser({
      githubId: String(MARCUS.id),
      githubLogin: MARCUS.login,
    });
    await bootstrap.models.subscriptionModel.create({
      userId: user.id,
      installationId: INSTALLATION_ID,
    });
    await bootstrap.models.userModel.updateOne(
      { _id: user.id },
      { $set: { pokeSettings: { mutedTypes: [], ...pokeSettings } } },
    );
    return { user, token };
  };

  const PULL_REQUEST = {
    number: 9,
    title: 'Wire up webhooks',
    html_url: 'https://github.com/ablaszkiewicz/proke/pull/9',
    user: MARCUS,
  };

  /** A verdict on marcus's pull request, as review `reviewId`. */
  const reviewPayload = (reviewer: object, reviewId = 1, state = 'approved') => ({
    action: 'submitted',
    installation: { id: Number(INSTALLATION_ID) },
    review: {
      id: reviewId,
      html_url: `https://github.com/ablaszkiewicz/proke/pull/9#pullrequestreview-${reviewId}`,
      state,
      body: 'Looks good.',
      user: reviewer,
    },
    pull_request: PULL_REQUEST,
    repository: REPOSITORY,
    sender: reviewer,
  });

  /** One inline comment belonging to review `reviewId`. */
  const reviewCommentPayload = (author: object, reviewId: number, commentId: number) => ({
    action: 'created',
    installation: { id: Number(INSTALLATION_ID) },
    comment: {
      id: commentId,
      pull_request_review_id: reviewId,
      html_url: `https://github.com/ablaszkiewicz/proke/pull/9#discussion_r${commentId}`,
      body: 'Nit.',
      user: author,
    },
    pull_request: PULL_REQUEST,
    repository: REPOSITORY,
    sender: author,
  });

  const storedSenders = async (userId: string) =>
    (await bootstrap.models.pokeSendersModel.findOne({ userId }).lean<any>().exec())?.senders ?? [];

  /** The count is written after the poke, so a delivered poke is not yet proof of it. */
  const waitForCount = (userId: string, login: string, total: number) =>
    waitFor(async () =>
      (await storedSenders(userId)).some(
        (sender: any) => sender.login === login && sender.count === total,
      ),
    );

  /** Nothing to wait for when nothing should be written, so give the handler time to not. */
  const settle = () => new Promise((resolve) => setTimeout(resolve, 150));

  it('counts a person whose review reached you', async () => {
    // given
    const { user, token } = await setupMarcus();

    // when
    await send('pull_request_review', reviewPayload(NICO));
    await waitForCount(user.id, 'nico', 1);

    // then
    const response = await readSenders(token);
    expect(response.status).toEqual(200);
    expect(response.body.windowDays).toEqual(30);
    expect(response.body.senders).toEqual([
      { login: 'nico', bot: false, reached: 1, held: 0, lastPokedAt: expect.any(String) },
    ]);
  });

  it('counts a bot that bots off kept back, and spells it the way the lists do', async () => {
    // given
    const { user, token } = await setupMarcus({ botMode: 'none' });

    // when
    await send('pull_request_review', reviewPayload(STAMPHOG));
    await waitForCount(user.id, 'stamphog', 1);

    // then - nothing reached marcus, and that is exactly what makes it worth suggesting
    await bootstrap.services.reviewBatchService.flushAll();
    expect(deliverSpy).not.toHaveBeenCalled();
    expect((await readSenders(token)).body.senders).toEqual([
      expect.objectContaining({ login: 'stamphog', bot: true, reached: 0, held: 1 }),
    ]);
  });

  it('counts a review once, however many pieces it came in', async () => {
    // given
    const { user, token } = await setupMarcus();

    // when - the submission and two inline comments, all review 77
    await send('pull_request_review_comment', reviewCommentPayload(NICO, 77, 1));
    await send('pull_request_review', reviewPayload(NICO, 77, 'commented'));
    await send('pull_request_review_comment', reviewCommentPayload(NICO, 77, 2));
    await waitForCount(user.id, 'nico', 1);
    await settle();

    // and - a second review is a second poke
    await send('pull_request_review', reviewPayload(NICO, 78));
    await waitForCount(user.id, 'nico', 2);

    // then
    expect((await readSenders(token)).body.senders).toEqual([
      expect.objectContaining({ login: 'nico', reached: 2, held: 0 }),
    ]);
  });

  it('counts what a bot’s review reached and what its comments did not, once each', async () => {
    // given - every bot let in, which never includes their talking
    const { user, token } = await setupMarcus({ botMode: 'all' });

    // when
    await send('pull_request_review', reviewPayload(RELEASE_BOT, 90, 'approved'));
    await send('pull_request_review_comment', reviewCommentPayload(RELEASE_BOT, 90, 1));
    await send('pull_request_review_comment', reviewCommentPayload(RELEASE_BOT, 90, 2));
    await waitForCount(user.id, 'release-bot', 2);
    await settle();

    // then
    expect((await readSenders(token)).body.senders).toEqual([
      expect.objectContaining({ login: 'release-bot', bot: true, reached: 1, held: 1 }),
    ]);
  });

  it('counts a bot’s review request on a colleague’s pull request as the colleague’s', async () => {
    // given
    const { user, token } = await setupMarcus();

    // when - an assignment bot asks marcus to review nico's work
    await send('pull_request', {
      action: 'review_requested',
      installation: { id: Number(INSTALLATION_ID) },
      requested_reviewer: MARCUS,
      pull_request: { ...PULL_REQUEST, user: NICO },
      repository: REPOSITORY,
      sender: { id: 1234, login: 'pr-assigner[bot]', type: 'Bot' },
    });
    await waitForCount(user.id, 'nico', 1);

    // then - blocking the bot would not stop this ask, so the bot is not who to suggest
    expect((await readSenders(token)).body.senders).toEqual([
      expect.objectContaining({ login: 'nico', bot: false, reached: 1 }),
    ]);
  });

  it('counts nothing for a kind that was switched off, or for your own doing', async () => {
    // given
    const { user } = await setupMarcus({ mutedTypes: [NotificationType.ReviewSubmitted] });

    // when
    await send('pull_request_review', reviewPayload(NICO));
    await send('issue_comment', {
      action: 'created',
      installation: { id: Number(INSTALLATION_ID) },
      issue: { number: 3, title: 'Something is broken', user: NICO },
      comment: { html_url: 'https://github.com/ablaszkiewicz/proke/issues/3#c', body: '@marcus' },
      repository: REPOSITORY,
      sender: MARCUS,
    });
    await settle();

    // then
    expect(await storedSenders(user.id)).toEqual([]);
  });

  it('forgets an account that has not poked you in a month', async () => {
    // given - dependabot, last heard from five weeks ago
    const { user, token } = await setupMarcus();
    const fiveWeeksAgo = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000);
    await bootstrap.models.pokeSendersModel.create({
      userId: user.id,
      senders: [{ login: 'dependabot', bot: true, count: 40, held: 0, lastAt: fiveWeeksAgo }],
      updatedAt: fiveWeeksAgo,
    });

    // then - not read, though the row is still there for the TTL monitor
    expect((await readSenders(token)).body.senders).toEqual([]);

    // when
    await send('pull_request_review', reviewPayload(NICO));
    await waitForCount(user.id, 'nico', 1);

    // then - and gone from the row with the next write
    expect((await storedSenders(user.id)).map((sender: any) => sender.login)).toEqual(['nico']);
  });

  it('keeps the row to its size, dropping the quietest person before any bot', async () => {
    // given - a full row: two bots heard from once, and a crowd of people heard from more
    const { user } = await setupMarcus();
    const now = new Date();
    const people = Array.from({ length: POKE_SENDERS_MAX - 3 }, (_unused, index) => ({
      login: `person-${index}`,
      bot: false,
      count: 5,
      held: 0,
      lastAt: now,
    }));
    await bootstrap.models.pokeSendersModel.create({
      userId: user.id,
      senders: [
        { login: 'dependabot', bot: true, count: 1, held: 1, lastAt: now },
        { login: 'renovate', bot: true, count: 1, held: 1, lastAt: now },
        { login: 'quiet-colleague', bot: false, count: 2, held: 0, lastAt: now },
        ...people,
      ],
      updatedAt: now,
    });

    // when - somebody new
    await send('pull_request_review', reviewPayload(NICO));
    await waitForCount(user.id, 'nico', 1);

    // then
    const logins = (await storedSenders(user.id)).map((sender: any) => sender.login);
    expect(logins).toHaveLength(POKE_SENDERS_MAX);
    expect(logins).toEqual(expect.arrayContaining(['dependabot', 'renovate', 'nico']));
    expect(logins).not.toContain('quiet-colleague');
  });

  it('needs a session', async () => {
    // when
    const response = await readSenders('not-a-token');

    // then
    expect(response.status).toEqual(401);
  });
});

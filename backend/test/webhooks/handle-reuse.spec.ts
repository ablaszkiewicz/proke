import { createHmac } from 'crypto';
import * as request from 'supertest';
import { NotificationType } from '../../src/notifications/core/entities/notification-type.enum';
import { createTestApp } from '../utils/bootstrap';
import { waitFor } from '../utils/wait-for';

const WEBHOOK_SECRET = 'test-webhook-secret';
const INSTALLATION_ID = '5150';

/**
 * GitHub frees a handle the moment its owner renames, and somebody else can take it minutes
 * later. Routing a poke by handle therefore has to answer to whoever holds it *now* - the
 * alternative is a private repository's comment arriving in a stranger's Slack.
 */
describe('Webhooks (github) - handle reuse', () => {
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

  afterEach(() => {
    deliverSpy.mockRestore();
  });

  afterAll(async () => {
    await bootstrap.methods.afterAll();
  });

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

  const subscribe = (userId: string) =>
    bootstrap.models.subscriptionModel.create({ userId, installationId: INSTALLATION_ID });

  const mentionPayload = (body: string) => ({
    action: 'created',
    installation: { id: Number(INSTALLATION_ID) },
    issue: {
      title: 'Something is broken',
      pull_request: { html_url: 'https://github.com/acme/private/pull/3' },
      user: { id: 7000, login: 'author' },
    },
    comment: { html_url: 'https://github.com/acme/private/pull/3#issuecomment-1', body },
    repository: { id: 314, full_name: 'acme/private' },
    sender: { id: 999, login: 'commenter' },
  });

  const pokedUserIds = async (expected: number) => {
    await waitFor(() => deliverSpy.mock.calls.length >= expected);
    await new Promise((resolve) => setTimeout(resolve, 50));
    return deliverSpy.mock.calls.map((call) => call[0].id);
  };

  it('routes a mention to the user holding the handle', async () => {
    // given
    const { user } = await bootstrap.utils.authUtils.setupUser({
      githubId: '4242',
      githubLogin: 'alice',
    });
    await subscribe(user.id);

    // when
    await send('issue_comment', mentionPayload('cc @alice'));

    // then
    expect(await pokedUserIds(1)).toEqual([user.id]);
  });

  it('matches the handle whatever case it was written in', async () => {
    // given - GitHub renders @Alice and @alice as the same person
    const { user } = await bootstrap.utils.authUtils.setupUser({
      githubId: '4242',
      githubLogin: 'Alice',
    });
    await subscribe(user.id);

    // when
    await send('issue_comment', mentionPayload('cc @ALICE'));

    // then
    expect(await pokedUserIds(1)).toEqual([user.id]);
  });

  it('stores the handle lowercased so the lookup can use its index', async () => {
    // given
    const { user } = await bootstrap.utils.authUtils.setupUser({ githubLogin: 'Alice' });

    // when
    const stored = await bootstrap.models.userModel.findById(user.id).lean<any>().exec();

    // then - the display copy keeps GitHub's casing; the queried copy does not
    expect(stored.githubLogin).toEqual('Alice');
    expect(stored.githubLoginLower).toEqual('alice');
  });

  it('hands the handle to whoever signed in with it last, and pokes only them', async () => {
    // given - A used to be @alice and has since renamed on GitHub, so their row is stale
    const stale = await bootstrap.utils.authUtils.setupUser({
      githubId: '1111',
      githubLogin: 'alice',
    });
    await subscribe(stale.user.id);

    // and - B has claimed @alice and signs in, which is the moment we learn about it
    const claimant = await bootstrap.utils.authUtils.setupUser({ githubId: '2222' });
    await bootstrap.services.userWriteService.update({
      id: claimant.user.id,
      githubLogin: 'alice',
    });
    await subscribe(claimant.user.id);

    // when
    await send('issue_comment', mentionPayload('cc @alice'));

    // then - exactly one poke, and not to the person who no longer owns the name
    expect(await pokedUserIds(1)).toEqual([claimant.user.id]);
  });

  it('leaves the previous holder in place, minus the handle', async () => {
    // given
    const stale = await bootstrap.utils.authUtils.setupUser({
      githubId: '1111',
      githubLogin: 'alice',
    });
    const claimant = await bootstrap.utils.authUtils.setupUser({ githubId: '2222' });

    // when
    await bootstrap.services.userWriteService.update({
      id: claimant.user.id,
      githubLogin: 'alice',
    });

    // then - they are a real user identified by githubId and go nowhere; they simply stop
    // answering to a name that is not theirs
    const previous = await bootstrap.models.userModel.findById(stale.user.id).lean<any>().exec();
    expect(previous).not.toBeNull();
    expect(previous.githubId).toEqual('1111');
    expect(previous.githubLogin).toBeUndefined();
    expect(previous.githubLoginLower).toBeUndefined();
  });

  it('never lets two rows claim one handle', async () => {
    // given
    await bootstrap.utils.authUtils.setupUser({ githubId: '1111', githubLogin: 'alice' });
    await bootstrap.utils.authUtils.setupUser({ githubId: '2222', githubLogin: 'alice' });

    // then - the invariant the unique index and the release-on-claim exist to hold
    expect(await bootstrap.models.userModel.countDocuments({ githubLoginLower: 'alice' })).toEqual(
      1,
    );
  });

  it('still pokes the stale user by id, which never moves', async () => {
    // given - A lost the handle but is still the author of the pull request
    const stale = await bootstrap.utils.authUtils.setupUser({
      githubId: '7000',
      githubLogin: 'alice',
    });
    await subscribe(stale.user.id);

    const claimant = await bootstrap.utils.authUtils.setupUser({ githubId: '2222' });
    await bootstrap.services.userWriteService.update({
      id: claimant.user.id,
      githubLogin: 'alice',
    });

    // when - a comment on their pull request, routed by the author id in the payload
    await send('issue_comment', mentionPayload('no mention here'));

    // then - losing a handle costs them mentions, nothing else
    await waitFor(() => deliverSpy.mock.calls.length > 0);
    expect(deliverSpy.mock.calls[0][0].id).toEqual(stale.user.id);
    expect(deliverSpy.mock.calls[0][1].type).toEqual(NotificationType.PullRequestComment);
    expect(claimant.user.id).toBeDefined();
  });
});

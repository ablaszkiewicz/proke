import * as nock from 'nock';
import { AnalyticsService } from '../../src/analytics/analytics.service';
import { NotificationType } from '../../src/notifications/core/entities/notification-type.enum';
import { createTestApp } from '../utils/bootstrap';

const TEAM_ID = 'T0ACME';

/**
 * What proke tells PostHog, asserted at the client rather than over the wire.
 *
 * Stubbing `client.capture` keeps the suite off the network entirely - no host to intercept, no
 * queue to flush, no wait - while still running the real AnalyticsService, so the prefix and the
 * property names are the ones production would send.
 *
 * The point is to pin two things that are silently wrong rather than loudly broken when they
 * drift: the `backend_` prefix, and the properties a poke has to carry.
 */
describe('Analytics', () => {
  let bootstrap: Awaited<ReturnType<typeof createTestApp>>;
  let capture: jest.SpyInstance;

  beforeAll(async () => {
    // A key is what makes AnalyticsService build a client at all. The host is never reached -
    // capture is stubbed below - but it is deliberately unroutable so a mistake here fails
    // fast rather than sending test events to a real project.
    process.env.POSTHOG_API_KEY = 'phc_test_key';
    process.env.POSTHOG_HOST = 'https://posthog.invalid';
    process.env.TOKEN_ENCRYPTION_KEY = 'test-encryption-key';

    bootstrap = await createTestApp();

    const client = bootstrap.module.get(AnalyticsService).client;

    if (!client) {
      throw new Error('Expected a PostHog client once POSTHOG_API_KEY is set');
    }

    // mockImplementation, not a passthrough spy: nothing may reach the client's queue, or
    // shutting the app down at the end would try to flush it to the host above.
    capture = jest.spyOn(client, 'capture').mockImplementation(() => undefined);

    // The same rule, for the other half of the client. Metrics aggregate in memory and are
    // flushed by the same `shutdown()` that drains the event queue, so a single counter
    // recorded here - and routing one webhook records several - turns afterAll into a wait for
    // an unroutable host to time out.
    for (const method of ['count', 'gauge', 'histogram'] as const) {
      jest.spyOn(client.metrics, method).mockImplementation(() => undefined);
    }
  });

  beforeEach(async () => {
    await bootstrap.methods.beforeEach();
    capture.mockClear();
  });

  afterAll(async () => {
    capture.mockRestore();
    await bootstrap.methods.afterAll();

    // The suite runs in band, so these would otherwise leak into every spec file that runs
    // after this one and give each of them a live client pointed at an unroutable host.
    delete process.env.POSTHOG_API_KEY;
    delete process.env.POSTHOG_HOST;
  });

  const delivery = () => bootstrap.services.slackNotificationDeliveryService;

  /** The one capture matching `event`, or a readable failure naming what was captured instead. */
  const captured = (event: string) => {
    const match = capture.mock.calls.map(([call]) => call).find((call) => call.event === event);

    if (!match) {
      const seen = capture.mock.calls.map(([call]) => call.event);
      throw new Error(`No ${event} captured. Saw: ${seen.join(', ') || 'nothing'}`);
    }

    return match;
  };

  const notification = (overrides: object = {}) => ({
    type: NotificationType.ReviewRequested,
    title: 'Make the reel blur honest',
    repositoryFullName: 'ablaszkiewicz/proke',
    htmlUrl: 'https://github.com/ablaszkiewicz/proke/pull/42',
    actorLogin: 'ada',
    number: 42,
    ...overrides,
  });

  /** Connected end to end: workspace installed, identity linked, DM channel already known. */
  const setupConnected = async () => {
    const { user } = await bootstrap.utils.authUtils.setupUser({ githubLogin: 'ablaszkiewicz' });

    await bootstrap.models.slackWorkspaceModel.create({
      teamId: TEAM_ID,
      teamName: 'Acme',
      botUserId: 'B0PROKE',
      botToken: 'xoxb-workspace-token',
    });
    await bootstrap.models.slackLinkModel.create({
      userId: user.id,
      teamId: TEAM_ID,
      slackUserId: 'U0ADA',
      dmChannelId: 'D0CACHED',
    });

    return user;
  };

  describe('pokes', () => {
    it('captures a delivered poke against the recipient, saying what and from where', async () => {
      // given - the cached DM channel means no conversations.open, so one mock covers it
      const user = await setupConnected();
      nock('https://slack.com').post('/api/chat.postMessage').reply(200, { ok: true });

      // when
      const outcome = await delivery().deliver(user, notification());

      // then
      expect(outcome).toEqual('sent');

      const event = captured('backend_poke_sent');

      // The distinct id is the person being poked, not the person who caused it. That one is
      // a property - swapping them would attribute everyone's pokes to whoever was noisiest.
      expect(event.distinctId).toEqual(user.id);
      expect(event.properties).toMatchObject({
        poke_type: NotificationType.ReviewRequested,
        trigger: 'github_webhook',
        repository: 'ablaszkiewicz/proke',
        repository_owner: 'ablaszkiewicz',
        actor_login: 'ada',
      });
    });

    it('captures nothing for a poke that had nowhere to go', async () => {
      // given - a user who has never connected Slack, which is an ordinary state not an error
      const { user } = await bootstrap.utils.authUtils.setupUser({ githubLogin: 'unconnected' });

      // when
      const outcome = await delivery().deliver(user, notification());

      // then - the delivery layer still reports why, for the caller and the log
      expect(outcome).toEqual('no-link');

      // ...but nothing is captured. This repeats for every event in every repository they are
      // subscribed to and says the same thing each time, and the thing it says - that this
      // person has not connected Slack - is already answerable from their events as a whole.
      expect(capture).not.toHaveBeenCalled();
    });

    it('captures a poke Slack refused, with the reason', async () => {
      // given - connected, but Slack turns the message down when it is actually attempted
      const user = await setupConnected();
      nock('https://slack.com')
        .post('/api/chat.postMessage')
        .reply(200, { ok: false, error: 'ratelimited' });

      // when
      const outcome = await delivery().deliver(user, notification());

      // then
      expect(outcome).toEqual('failed');

      const event = captured('backend_poke_failed');

      expect(event.distinctId).toEqual(user.id);
      expect(event.properties).toMatchObject({
        reason: 'failed',
        poke_type: NotificationType.ReviewRequested,
        repository: 'ablaszkiewicz/proke',
      });
    });

    it('captures a revoked workspace, which is a failure rather than a missing setup', async () => {
      // given - the bot token was alive until this moment. Same `workspace-missing` outcome as
      // a workspace proke was never added to, but a completely different event: this is a whole
      // workspace going down, discovered the only way it can be.
      const user = await setupConnected();
      nock('https://slack.com')
        .post('/api/chat.postMessage')
        .reply(200, { ok: false, error: 'token_revoked' });

      // when
      const outcome = await delivery().deliver(user, notification());

      // then
      expect(outcome).toEqual('workspace-missing');
      expect(captured('backend_poke_failed').properties).toMatchObject({
        reason: 'workspace-missing',
      });
    });

    it('tells a test poke apart from a real one', async () => {
      // given
      const user = await setupConnected();
      nock('https://slack.com').post('/api/chat.postMessage').reply(200, { ok: true });

      // when
      await delivery().deliverTest(user);

      // then - counted, but never as a notification somebody actually received
      expect(captured('backend_poke_sent').properties).toMatchObject({
        poke_type: 'test',
        trigger: 'test',
      });
    });
  });

  describe('configuration', () => {
    it('sends nothing at all without an API key', async () => {
      // given - what a local run and every other spec file in this suite look like
      const key = process.env.POSTHOG_API_KEY;
      delete process.env.POSTHOG_API_KEY;

      try {
        const analytics = new AnalyticsService();

        // when
        analytics.capture('user-1', 'poke_sent', { repository: 'ablaszkiewicz/proke' });
        analytics.identify('user-1', { github_login: 'ablaszkiewicz' });

        // then - no client to send with, and nothing thrown at the caller for it either
        expect(analytics.client).toBeNull();
      } finally {
        process.env.POSTHOG_API_KEY = key;
      }
    });
  });
});

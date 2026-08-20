import { createHmac } from 'crypto';
import * as request from 'supertest';
import { AnalyticsService } from '../../src/analytics/analytics.service';
import { createTestApp } from '../utils/bootstrap';
import { waitFor } from '../utils/wait-for';

const WEBHOOK_SECRET = 'test-metrics-secret';

/**
 * What proke counts, asserted at the client rather than over the wire - the same shape as
 * analytics.spec.ts next door, and for the same reason.
 *
 * The point is not that a number moved. It is the one property that cannot be checked by reading
 * the code and is catastrophic when wrong: **no attribute may carry an unbounded value**. A
 * series is the metric name plus every attribute value, the flush window holds a thousand of
 * them across the whole process, and past that new series are dropped with a single console
 * warning nobody is watching. So an installation id reaching a dimension does not look like a
 * bug - it looks like the other metrics quietly going missing days later.
 *
 * Which is exactly what a route taken from `req.originalUrl` instead of `req.route.path` would
 * do, and there is no way to tell those apart by inspection.
 */
describe('Metrics', () => {
  let bootstrap: Awaited<ReturnType<typeof createTestApp>>;
  let count: jest.SpyInstance;
  let histogram: jest.SpyInstance;

  beforeAll(async () => {
    // A key is what makes AnalyticsService build a client at all, and so what makes the metrics
    // half of it exist. The host is deliberately unroutable and every recording method is
    // stubbed below, so nothing here reaches the network or the flush queue.
    process.env.POSTHOG_API_KEY = 'phc_test_key';
    process.env.POSTHOG_HOST = 'https://posthog.invalid';
    process.env.GH_APP_WEBHOOK_SECRET = WEBHOOK_SECRET;

    bootstrap = await createTestApp();

    const client = bootstrap.module.get(AnalyticsService).client;

    if (!client) {
      throw new Error('Expected a PostHog client once POSTHOG_API_KEY is set');
    }

    count = jest.spyOn(client.metrics, 'count').mockImplementation(() => undefined);
    histogram = jest.spyOn(client.metrics, 'histogram').mockImplementation(() => undefined);
    jest.spyOn(client.metrics, 'gauge').mockImplementation(() => undefined);

    // The event half too, and it is not optional. These specs route real webhooks, and routing
    // captures events - so leaving `capture` live queues them against the unroutable host above
    // and turns afterAll into a wait for the flush to give up. Both halves of the client have to
    // be stubbed or neither is.
    jest.spyOn(client, 'capture').mockImplementation(() => undefined);
    jest.spyOn(client, 'identify').mockImplementation(() => undefined);
  });

  beforeEach(async () => {
    await bootstrap.methods.beforeEach();
    count.mockClear();
    histogram.mockClear();
  });

  afterAll(async () => {
    try {
      // Before the mocks are restored, so the shutdown flush still finds a stubbed client.
      await bootstrap.methods.afterAll();
    } finally {
      // In a `finally` because the suite runs in band: if closing the app ever hangs, these
      // would otherwise leak into every spec file after this one and hand each of them a live
      // client pointed at an unroutable host - which is a failure over in someone else's spec,
      // reported as a timeout, with nothing pointing back here.
      delete process.env.POSTHOG_API_KEY;
      delete process.env.POSTHOG_HOST;
      jest.restoreAllMocks();
    }
  });

  /** Every recording of one metric, as `[name, value, options]` triples. */
  const recorded = (spy: jest.SpyInstance, name: string) =>
    spy.mock.calls.filter(([recordedName]) => recordedName === name);

  const attributesOf = (spy: jest.SpyInstance, name: string) =>
    recorded(spy, name).map(([, , options]) => options?.attributes ?? {});

  const sendWebhook = (event: string, payload: object) => {
    const body = JSON.stringify(payload);
    const signature = 'sha256=' + createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');

    return request(bootstrap.app.getHttpServer())
      .post('/webhooks/github')
      .set('content-type', 'application/json')
      .set('x-github-event', event)
      .set('x-hub-signature-256', signature)
      .send(body);
  };

  describe('http.server.duration', () => {
    it('records the templated route, not the URL that carries the id', async () => {
      const { token } = await bootstrap.utils.authUtils.setupUser();

      // A route with a path parameter, called with a value that would be unmistakable as a
      // series: if this id reaches the metric, every organisation using proke becomes one.
      await request(bootstrap.app.getHttpServer())
        .delete('/connections/99887766')
        .set('Authorization', `Bearer ${token}`);

      await waitFor(() => recorded(histogram, 'http.server.duration').length > 0);

      const routes = attributesOf(histogram, 'http.server.duration').map(
        (attributes) => attributes.route,
      );

      expect(routes).toContain('/connections/:installationId');
      expect(routes.join(' ')).not.toContain('99887766');
    });

    it('records requests a guard rejected, which is why this is middleware', async () => {
      await request(bootstrap.app.getHttpServer()).get('/users/me');

      await waitFor(() => recorded(histogram, 'http.server.duration').length > 0);

      expect(attributesOf(histogram, 'http.server.duration')).toContainEqual(
        expect.objectContaining({ route: '/users/me', method: 'GET', status: '401' }),
      );
    });

    it('records the status Nest actually wrote rather than the framework default', async () => {
      await sendWebhook('pull_request', { action: 'synchronize' });

      await waitFor(() => recorded(histogram, 'http.server.duration').length > 0);

      // @HttpCode(202) is applied when the response is written, which is after every interceptor
      // has finished. Anything reading earlier records the busiest endpoint in proke as a 200.
      expect(attributesOf(histogram, 'http.server.duration')).toContainEqual(
        expect.objectContaining({ route: '/webhooks/github', status: '202' }),
      );
    });
  });

  describe('proke.webhook.received', () => {
    it('counts a delivery by event and action', async () => {
      await sendWebhook('issue_comment', { action: 'created' });

      await waitFor(() =>
        attributesOf(count, 'proke.webhook.received').some(
          (attributes) => attributes.event === 'issue_comment' && attributes.action === 'created',
        ),
      );

      expect(attributesOf(count, 'proke.webhook.received')).toContainEqual({
        event: 'issue_comment',
        action: 'created',
      });
    });

    it('maps an event proke is not subscribed to onto a single bounded label', async () => {
      await sendWebhook('deployment_status', { action: 'whatever_github_invents_next' });

      await waitFor(() => recorded(count, 'proke.webhook.received').length > 0);

      expect(attributesOf(count, 'proke.webhook.received')).toContainEqual({
        event: 'other',
        action: 'other',
      });
    });
  });

  describe('proke.poke.dropped', () => {
    it('counts the reason a candidate was dropped', async () => {
      // A comment from a bot on a pull request: one candidate for the author, suppressed as
      // chatter before anything is looked up. The single largest source of the noise proke
      // exists to stop, and previously a debug line and nothing else.
      await sendWebhook('issue_comment', {
        action: 'created',
        installation: { id: 4242 },
        repository: { id: 1, full_name: 'acme/widgets', private: false },
        sender: { id: 9, login: 'dependabot[bot]', type: 'Bot' },
        issue: { number: 7, title: 'Bump lodash', user: { id: 5 }, pull_request: {} },
        comment: { id: 11, body: 'Bumped it.' },
      });

      await waitFor(() => recorded(count, 'proke.poke.dropped').length > 0);

      expect(attributesOf(count, 'proke.poke.dropped')).toContainEqual({ reason: 'bot_chatter' });
    });

    it('never carries a repository or an installation on a dimension', async () => {
      await sendWebhook('issue_comment', {
        action: 'created',
        installation: { id: 4242 },
        repository: { id: 1, full_name: 'acme/widgets', private: false },
        sender: { id: 9, login: 'someone', type: 'User' },
        issue: { number: 7, title: 'A bug', user: { id: 5 }, pull_request: {} },
        comment: { id: 11, body: 'Looks wrong to me.' },
      });

      await waitFor(() => recorded(count, 'proke.poke.dropped').length > 0);

      // The recipient is nobody proke knows, so this is `not_a_user` - and the interesting part
      // is what is absent. Every one of these is a fact the event stream carries properly and
      // that would be an unbounded series here.
      for (const attributes of attributesOf(count, 'proke.poke.dropped')) {
        expect(Object.keys(attributes)).toEqual(['reason']);
        expect(JSON.stringify(attributes)).not.toContain('acme/widgets');
        expect(JSON.stringify(attributes)).not.toContain('4242');
      }
    });
  });
});

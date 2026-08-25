import { INestApplication } from '@nestjs/common';
import * as nock from 'nock';
import * as request from 'supertest';
import { MAX_WARM_PINS } from '../../src/inbox/warm/core/entities/inbox-warm-pin.interface';
import { createTestApp } from '../utils/bootstrap';

/**
 * Keeping a view ready.
 *
 * Two halves that are worth testing for different reasons. The pins themselves are a cap and two
 * idempotent writes, where the interesting cases are the ones a client can reach by pressing a
 * switch twice or having two tabs open. The sweep is a timer that calls the same refresh the
 * endpoint calls, where the interesting cases are all about what it declines to do - somebody
 * who has been away, somebody whose token is gone, a pass that is still running.
 */
describe('Inbox warming', () => {
  let app: INestApplication;
  let bootstrap: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    bootstrap = await createTestApp();
    app = bootstrap.app;
  });

  beforeEach(async () => {
    await bootstrap.methods.beforeEach();
  });

  afterAll(async () => {
    await bootstrap.methods.afterAll();
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const pullRequest = (overrides: Record<string, any> = {}) => ({
    id: `node-${Math.random()}`,
    number: 1,
    title: 'A change',
    url: 'https://github.com/acme/api/pull/1',
    isDraft: false,
    updatedAt: '2020-01-01T00:00:00Z',
    repository: { id: 'repo-1', nameWithOwner: 'acme/api' },
    author: { __typename: 'User', login: 'bob', avatarUrl: 'https://avatars/bob' },
    reviewThreads: { nodes: [] },
    ...overrides,
  });

  /** One GraphQL answer and one teams answer: exactly what warming one view costs. */
  const mockOneRefresh = (waitingOnYou: any[] = [pullRequest()]) => {
    nock('https://api.github.com')
      .post('/graphql')
      .reply(200, {
        data: {
          viewer: { login: 'ada' },
          yours: { nodes: [] },
          waitingOnYou: { nodes: waitingOnYou },
        },
      });
    nock('https://api.github.com').get('/user/teams').query(true).reply(200, []);
  };

  const warmUser = async (overrides: { githubAccessToken?: string | undefined } = {}) =>
    bootstrap.utils.authUtils.setupUser({
      githubAccessToken:
        'githubAccessToken' in overrides ? overrides.githubAccessToken : 'gho_token',
    });

  describe('pinning', () => {
    it('keeps a view and answers with the whole list', async () => {
      const { token } = await warmUser();

      const { body } = await request(app.getHttpServer())
        .put('/inbox/warm')
        .query({ includeApproved: 'true', recentDrafts: '7d' })
        .set(auth(token))
        .expect(200);

      expect(body.max).toBe(MAX_WARM_PINS);
      expect(body.pins).toHaveLength(1);
      expect(body.pins[0].filters).toEqual({ includeApproved: true, recentDrafts: '7d' });
    });

    it('fills the gaps from the defaults, so a client that sends nothing pins the default view', async () => {
      const { token } = await warmUser();

      const { body } = await request(app.getHttpServer())
        .put('/inbox/warm')
        .set(auth(token))
        .expect(200);

      expect(body.pins[0].filters).toEqual({ includeApproved: false, recentDrafts: '1d' });
    });

    /*
     * A pin is a set of *build* filters. View filters are applied to a stored snapshot on the
     * way out, so they change nothing about what is warmed - and a client sending all six to
     * this route must not end up with two pins that warm the same key.
     */
    it('ignores the view filters entirely', async () => {
      const { token } = await warmUser();

      await request(app.getHttpServer())
        .put('/inbox/warm')
        .query({ recentDrafts: '7d', ignoredAuthors: 'dependabot', separateBots: 'false' })
        .set(auth(token))
        .expect(200);

      const { body } = await request(app.getHttpServer())
        .put('/inbox/warm')
        .query({ recentDrafts: '7d', ignoredAuthors: 'renovate', separateTeam: 'false' })
        .set(auth(token))
        .expect(200);

      expect(body.pins).toHaveLength(1);
      expect(body.pins[0].filters).toEqual({ includeApproved: false, recentDrafts: '7d' });
    });

    it('is idempotent: pinning something already pinned succeeds and adds nothing', async () => {
      const { token } = await warmUser();

      await request(app.getHttpServer()).put('/inbox/warm').set(auth(token)).expect(200);

      const { body } = await request(app.getHttpServer())
        .put('/inbox/warm')
        .set(auth(token))
        .expect(200);

      expect(body.pins).toHaveLength(1);
    });

    it('refuses a fourth', async () => {
      const { token } = await warmUser();

      for (const recentDrafts of ['6h', '12h', '1d']) {
        await request(app.getHttpServer())
          .put('/inbox/warm')
          .query({ recentDrafts })
          .set(auth(token))
          .expect(200);
      }

      await request(app.getHttpServer())
        .put('/inbox/warm')
        .query({ recentDrafts: '3d' })
        .set(auth(token))
        .expect(409);

      const { body } = await request(app.getHttpServer())
        .get('/inbox/warm')
        .set(auth(token))
        .expect(200);

      expect(body.pins).toHaveLength(MAX_WARM_PINS);
      expect(body.pins.map((pin: any) => pin.filters.recentDrafts).sort()).toEqual([
        '12h',
        '1d',
        '6h',
      ]);
    });

    /*
     * The cap is enforced by a guarded upsert rather than a count followed by an insert,
     * precisely so this cannot produce four. Two tabs is the ordinary way to reach it.
     */
    it('holds the cap when four arrive at once', async () => {
      const { token } = await warmUser();

      const responses = await Promise.all(
        ['6h', '12h', '1d', '3d'].map((recentDrafts) =>
          request(app.getHttpServer()).put('/inbox/warm').query({ recentDrafts }).set(auth(token)),
        ),
      );

      expect(responses.filter((response) => response.status === 200)).toHaveLength(MAX_WARM_PINS);
      expect(responses.filter((response) => response.status === 409)).toHaveLength(1);

      const { body } = await request(app.getHttpServer())
        .get('/inbox/warm')
        .set(auth(token))
        .expect(200);

      expect(body.pins).toHaveLength(MAX_WARM_PINS);
    });

    it('removes one, and removing it again is still a success', async () => {
      const { token } = await warmUser();

      await request(app.getHttpServer())
        .put('/inbox/warm')
        .query({ recentDrafts: '7d' })
        .set(auth(token))
        .expect(200);

      const removed = await request(app.getHttpServer())
        .delete('/inbox/warm')
        .query({ recentDrafts: '7d' })
        .set(auth(token))
        .expect(200);

      expect(removed.body.pins).toHaveLength(0);

      const again = await request(app.getHttpServer())
        .delete('/inbox/warm')
        .query({ recentDrafts: '7d' })
        .set(auth(token))
        .expect(200);

      expect(again.body.pins).toHaveLength(0);
    });

    it('frees a slot, so undoing a removal at capacity works', async () => {
      const { token } = await warmUser();

      for (const recentDrafts of ['6h', '12h', '1d']) {
        await request(app.getHttpServer())
          .put('/inbox/warm')
          .query({ recentDrafts })
          .set(auth(token))
          .expect(200);
      }

      await request(app.getHttpServer())
        .delete('/inbox/warm')
        .query({ recentDrafts: '12h' })
        .set(auth(token))
        .expect(200);

      const { body } = await request(app.getHttpServer())
        .put('/inbox/warm')
        .query({ recentDrafts: '12h' })
        .set(auth(token))
        .expect(200);

      expect(body.pins).toHaveLength(MAX_WARM_PINS);
    });

    it('keeps one person pins away from another', async () => {
      const first = await warmUser();
      const second = await warmUser();

      await request(app.getHttpServer())
        .put('/inbox/warm')
        .query({ recentDrafts: '7d' })
        .set(auth(first.token))
        .expect(200);

      const { body } = await request(app.getHttpServer())
        .get('/inbox/warm')
        .set(auth(second.token))
        .expect(200);

      expect(body.pins).toHaveLength(0);
    });

    it('rejects a filter it does not recognise rather than quietly pinning the default', async () => {
      const { token } = await warmUser();

      await request(app.getHttpServer())
        .put('/inbox/warm')
        .query({ recentDrafts: 'forever' })
        .set(auth(token))
        .expect(400);
    });
  });

  describe('the sweep', () => {
    it('builds a snapshot for a pinned view, so the next read is answered without GitHub', async () => {
      const { token } = await warmUser();

      await request(app.getHttpServer())
        .put('/inbox/warm')
        .query({ recentDrafts: '7d' })
        .set(auth(token))
        .expect(200);

      // Nothing has been built yet: reading under these filters finds no snapshot at all, which
      // is the state the sweep exists to remove.
      const cold = await request(app.getHttpServer())
        .get('/inbox')
        .query({ recentDrafts: '7d' })
        .set(auth(token))
        .expect(200);

      expect(cold.body.refreshedAt).toBeUndefined();

      mockOneRefresh();
      await bootstrap.services.inboxWarmerService.sweep();

      const warm = await request(app.getHttpServer())
        .get('/inbox')
        .query({ recentDrafts: '7d' })
        .set(auth(token))
        .expect(200);

      expect(warm.body.refreshedAt).toBeDefined();
      expect(warm.body.waitingOnYou.flatMap((s: any) => s.pullRequests)).toHaveLength(1);
    });

    /*
     * The whole reason a pin is only the build filters. One sweep, one GitHub query, and a read
     * under different view filters is answered from the snapshot it wrote - so nock having no
     * second reply mocked is the assertion.
     */
    it('warms every view-filter variation of the set it built', async () => {
      const { token } = await warmUser();

      await request(app.getHttpServer()).put('/inbox/warm').set(auth(token)).expect(200);

      mockOneRefresh();
      await bootstrap.services.inboxWarmerService.sweep();

      const { body } = await request(app.getHttpServer())
        .get('/inbox')
        .query({ separateBots: 'false', ignoredAuthors: 'renovate' })
        .set(auth(token))
        .expect(200);

      expect(body.refreshedAt).toBeDefined();
      expect(nock.pendingMocks()).toHaveLength(0);
    });

    it('leaves alone somebody who has not been here for two days', async () => {
      const { token, user } = await warmUser();

      await request(app.getHttpServer()).put('/inbox/warm').set(auth(token)).expect(200);

      await bootstrap.models.userModel.updateOne(
        { _id: user.id },
        { $set: { lastActivityDate: new Date(Date.now() - 72 * 60 * 60_000) } },
      );

      // No mocks at all: nock.disableNetConnect means any GitHub call here fails the spec.
      await bootstrap.services.inboxWarmerService.sweep();

      const { body } = await request(app.getHttpServer())
        .get('/inbox')
        .set(auth(token))
        .expect(200);

      expect(body.refreshedAt).toBeUndefined();
    });

    it('leaves alone somebody whose GitHub authorization is gone', async () => {
      const { token } = await warmUser({ githubAccessToken: undefined });

      await request(app.getHttpServer()).put('/inbox/warm').set(auth(token)).expect(200);

      await bootstrap.services.inboxWarmerService.sweep();

      const { body } = await request(app.getHttpServer())
        .get('/inbox')
        .set(auth(token))
        .expect(200);

      expect(body.refreshedAt).toBeUndefined();
    });

    it('warms every pin one person holds', async () => {
      const { token } = await warmUser();

      for (const recentDrafts of ['6h', '7d']) {
        await request(app.getHttpServer())
          .put('/inbox/warm')
          .query({ recentDrafts })
          .set(auth(token))
          .expect(200);
      }

      mockOneRefresh();
      mockOneRefresh();
      await bootstrap.services.inboxWarmerService.sweep();

      for (const recentDrafts of ['6h', '7d']) {
        const { body } = await request(app.getHttpServer())
          .get('/inbox')
          .query({ recentDrafts })
          .set(auth(token))
          .expect(200);

        expect(body.refreshedAt).toBeDefined();
      }
    });

    /*
     * GitHub being unreachable is an ordinary afternoon, not an exception. The sweep has to
     * survive it for everybody else in the same pass, which is why this asserts the second
     * user's snapshot rather than only that nothing threw.
     */
    it('carries on past a user whose refresh fails', async () => {
      const first = await warmUser();
      const second = await warmUser();

      for (const { token } of [first, second]) {
        await request(app.getHttpServer()).put('/inbox/warm').set(auth(token)).expect(200);
      }

      nock('https://api.github.com').post('/graphql').reply(500, {});
      nock('https://api.github.com')
        .post('/graphql')
        .reply(200, {
          data: { viewer: { login: 'ada' }, yours: { nodes: [] }, waitingOnYou: { nodes: [] } },
        });
      nock('https://api.github.com').get('/user/teams').query(true).times(2).reply(200, []);

      await expect(bootstrap.services.inboxWarmerService.sweep()).resolves.toBeUndefined();

      const bodies = await Promise.all(
        [first, second].map(({ token }) =>
          request(app.getHttpServer()).get('/inbox').set(auth(token)).expect(200),
        ),
      );

      expect(bodies.some(({ body }) => body.refreshedAt !== undefined)).toBe(true);
    });

    it('does nothing at all when nobody has pinned anything', async () => {
      await warmUser();

      await expect(bootstrap.services.inboxWarmerService.sweep()).resolves.toBeUndefined();
      expect(nock.pendingMocks()).toHaveLength(0);
    });
  });

  describe('account deletion', () => {
    it('takes the pins with it', async () => {
      const { token, user } = await warmUser();

      await request(app.getHttpServer()).put('/inbox/warm').set(auth(token)).expect(200);

      await request(app.getHttpServer()).delete('/users/me').set(auth(token)).expect(204);

      expect(await bootstrap.models.inboxWarmPinModel.countDocuments({ userId: user.id })).toBe(0);
    });
  });
});

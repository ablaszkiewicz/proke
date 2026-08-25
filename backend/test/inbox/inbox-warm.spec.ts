import { INestApplication } from '@nestjs/common';
import * as nock from 'nock';
import * as request from 'supertest';
import { DEFAULT_INBOX_FILTERS } from '../../src/inbox/core/entities/inbox-filters.interface';
import { createTestApp } from '../utils/bootstrap';

/**
 * The inbox settings, and the sweep that keeps everybody's inbox ready under them.
 *
 * Two halves that are worth testing for different reasons. The settings are one route and one
 * field on the user, where the interesting cases are the edges of the shape - what a client that
 * sends nothing gets, what an unknown value does, what the lists look like after the server has
 * had them. The sweep is a timer that calls the same refresh the endpoint calls, where the
 * interesting cases are all about what it declines to do - somebody who has been away, somebody
 * who never opens the inbox, somebody whose token is gone.
 */
describe('Inbox settings and warming', () => {
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

  /** One GraphQL answer and one teams answer: exactly what building one inbox costs. */
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

  const inboxUser = async (overrides: { githubAccessToken?: string | undefined } = {}) =>
    bootstrap.utils.authUtils.setupUser({
      githubAccessToken:
        'githubAccessToken' in overrides ? overrides.githubAccessToken : 'gho_token',
    });

  /**
   * What the page does on opening: asks for a refresh. This is what stamps the person as an
   * inbox user, so it is the precondition of every sweep spec below.
   *
   * The snapshot it builds is dropped afterwards so the specs can tell the sweep's work from
   * this call's - a `refreshedAt` after the sweep then means the sweep built it.
   */
  const openInbox = async (token: string, query: Record<string, string> = {}) => {
    mockOneRefresh();
    await request(app.getHttpServer())
      .post('/inbox/refresh')
      .query(query)
      .set(auth(token))
      .expect(200);
    bootstrap.services.inMemoryCacheService.clear();
  };

  describe('settings', () => {
    it('are the defaults for somebody who has never touched a switch', async () => {
      const { token } = await inboxUser();

      const { body } = await request(app.getHttpServer())
        .get('/users/me')
        .set(auth(token))
        .expect(200);

      expect(body.inboxSettings).toEqual(DEFAULT_INBOX_FILTERS);
    });

    it('are stored whole and come back with the user', async () => {
      const { token } = await inboxUser();

      const updated = await request(app.getHttpServer())
        .put('/inbox/settings')
        .send({
          includeApproved: true,
          recentDrafts: '7d',
          separateTeam: false,
          separateBots: true,
          excludedTeams: ['Acme/Platform'],
          ignoredAuthors: ['Dependabot', 'renovate', 'dependabot'],
        })
        .set(auth(token))
        .expect(200);

      const expected = {
        includeApproved: true,
        recentDrafts: '7d',
        separateTeam: false,
        separateBots: true,
        // Normalised the same way the inbox routes normalise a query string: lowercased and
        // deduplicated, so what is stored is what the classifier will compare against.
        excludedTeams: ['acme/platform'],
        ignoredAuthors: ['dependabot', 'renovate'],
      };

      expect(updated.body).toEqual(expected);

      const me = await request(app.getHttpServer()).get('/users/me').set(auth(token)).expect(200);

      expect(me.body.inboxSettings).toEqual(expected);
    });

    /*
     * A PUT is the whole set, so sending less than that is sending the defaults for the rest.
     * This is how a client says "reset": it does not need a route of its own.
     */
    it('reads a setting that was left out as its default, which is how reset is spelled', async () => {
      const { token } = await inboxUser();

      await request(app.getHttpServer())
        .put('/inbox/settings')
        .send({ includeApproved: true, ignoredAuthors: ['dependabot'] })
        .set(auth(token))
        .expect(200);

      const { body } = await request(app.getHttpServer())
        .put('/inbox/settings')
        .send({})
        .set(auth(token))
        .expect(200);

      expect(body).toEqual(DEFAULT_INBOX_FILTERS);
    });

    it('rejects a value it does not recognise rather than quietly storing the default', async () => {
      const { token } = await inboxUser();

      await request(app.getHttpServer())
        .put('/inbox/settings')
        .send({ recentDrafts: 'forever' })
        .set(auth(token))
        .expect(400);

      await request(app.getHttpServer())
        .put('/inbox/settings')
        .send({ includeApproved: 'yes' })
        .set(auth(token))
        .expect(400);
    });

    it('keeps one person settings away from another', async () => {
      const first = await inboxUser();
      const second = await inboxUser();

      await request(app.getHttpServer())
        .put('/inbox/settings')
        .send({ recentDrafts: '7d' })
        .set(auth(first.token))
        .expect(200);

      const { body } = await request(app.getHttpServer())
        .get('/users/me')
        .set(auth(second.token))
        .expect(200);

      expect(body.inboxSettings.recentDrafts).toBe(DEFAULT_INBOX_FILTERS.recentDrafts);
    });
  });

  describe('the sweep', () => {
    it('builds a snapshot for somebody who opened the inbox, so the next read is answered without GitHub', async () => {
      const { token } = await inboxUser();

      await openInbox(token);

      // Nothing is built: the snapshot the opening made was dropped, which is the state after a
      // deploy and the state the sweep exists to remove.
      const cold = await request(app.getHttpServer()).get('/inbox').set(auth(token)).expect(200);

      expect(cold.body.refreshedAt).toBeUndefined();

      mockOneRefresh();
      await bootstrap.services.inboxWarmerService.sweep();

      const warm = await request(app.getHttpServer()).get('/inbox').set(auth(token)).expect(200);

      expect(warm.body.refreshedAt).toBeDefined();
      expect(warm.body.waitingOnYou.flatMap((s: any) => s.pullRequests)).toHaveLength(1);
    });

    /*
     * The whole point of storing the settings: the sweep builds the view the page is going to
     * open on, which is the stored one - not whatever the last request happened to carry.
     */
    it('builds under the stored settings, not the ones the last request carried', async () => {
      const { token } = await inboxUser();

      await request(app.getHttpServer())
        .put('/inbox/settings')
        .send({ recentDrafts: '7d' })
        .set(auth(token))
        .expect(200);

      // A refresh under the defaults - a stale tab, say. It stamps the person as an inbox user
      // and says nothing about what to warm.
      await openInbox(token);

      mockOneRefresh();
      await bootstrap.services.inboxWarmerService.sweep();

      const stored = await request(app.getHttpServer())
        .get('/inbox')
        .query({ recentDrafts: '7d' })
        .set(auth(token))
        .expect(200);

      expect(stored.body.refreshedAt).toBeDefined();

      const other = await request(app.getHttpServer()).get('/inbox').set(auth(token)).expect(200);

      expect(other.body.refreshedAt).toBeUndefined();
    });

    /*
     * Only the build half of the settings decides what is built. One sweep, one GitHub query,
     * and a read under different view filters is answered from the snapshot it wrote - so nock
     * having no second reply mocked is the assertion.
     */
    it('warms every view-filter variation of the set it built', async () => {
      const { token } = await inboxUser();

      await openInbox(token);

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

    it('leaves alone somebody who has not opened the inbox for two days', async () => {
      const { token, user } = await inboxUser();

      await openInbox(token);

      await bootstrap.models.userModel.updateOne(
        { _id: user.id },
        { $set: { inboxLastUsedAt: new Date(Date.now() - 72 * 60 * 60_000) } },
      );

      // No mocks at all: nock.disableNetConnect means any GitHub call here fails the spec.
      await bootstrap.services.inboxWarmerService.sweep();

      const { body } = await request(app.getHttpServer()).get('/inbox').set(auth(token)).expect(200);

      expect(body.refreshedAt).toBeUndefined();
    });

    /*
     * Being around is not the same as using the inbox. Plenty of people use proke for pokes and
     * never open it, and their inbox is not worth a GitHub query every five minutes - which is
     * why the gate reads `inboxLastUsedAt` and not `lastActivityDate`.
     */
    it('leaves alone somebody who was here but never opened the inbox', async () => {
      const { token } = await inboxUser();

      // Any authenticated request stamps activity. This one is not an inbox request.
      await request(app.getHttpServer()).get('/users/me').set(auth(token)).expect(200);

      await bootstrap.services.inboxWarmerService.sweep();

      const { body } = await request(app.getHttpServer()).get('/inbox').set(auth(token)).expect(200);

      expect(body.refreshedAt).toBeUndefined();
    });

    it('leaves alone somebody whose GitHub authorization is gone', async () => {
      const { token, user } = await inboxUser({ githubAccessToken: undefined });

      // A refresh with no token stamps use all the same - it is a fact about the person, not
      // about GitHub - and answers with `githubReauthRequired` rather than building anything.
      const opened = await request(app.getHttpServer())
        .post('/inbox/refresh')
        .set(auth(token))
        .expect(200);

      expect(opened.body.githubReauthRequired).toBe(true);
      expect(
        (await bootstrap.models.userModel.findById(user.id).lean())?.inboxLastUsedAt,
      ).toBeDefined();

      await bootstrap.services.inboxWarmerService.sweep();

      const { body } = await request(app.getHttpServer()).get('/inbox').set(auth(token)).expect(200);

      expect(body.refreshedAt).toBeUndefined();
    });

    /*
     * The sweep goes through InboxRefreshService and not the endpoint, so warming somebody
     * never counts as them having been here. Otherwise one visit would keep an inbox warm for
     * ever, each sweep renewing the stamp the next one reads.
     */
    it('does not count as the person having opened the inbox', async () => {
      const { token, user } = await inboxUser();

      await openInbox(token);

      const before = (await bootstrap.models.userModel.findById(user.id).lean())?.inboxLastUsedAt;

      mockOneRefresh();
      await bootstrap.services.inboxWarmerService.sweep();

      const after = (await bootstrap.models.userModel.findById(user.id).lean())?.inboxLastUsedAt;

      expect(after).toEqual(before);
    });

    /*
     * GitHub being unreachable is an ordinary afternoon, not an exception. The sweep has to
     * survive it for everybody else in the same pass, which is why this asserts the second
     * user's snapshot rather than only that nothing threw.
     */
    it('carries on past a user whose refresh fails', async () => {
      const first = await inboxUser();
      const second = await inboxUser();

      for (const { token } of [first, second]) {
        await openInbox(token);
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

    it('does nothing at all when nobody has opened the inbox', async () => {
      await inboxUser();

      await expect(bootstrap.services.inboxWarmerService.sweep()).resolves.toBeUndefined();
      expect(nock.pendingMocks()).toHaveLength(0);
    });
  });
});

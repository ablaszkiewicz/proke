import { INestApplication } from '@nestjs/common';
import * as nock from 'nock';
import * as request from 'supertest';
import { GithubInboxDataService } from '../../src/inbox/github-inbox-data.service';
import { createTestApp } from '../utils/bootstrap';

/**
 * The inbox endpoint.
 *
 * Everything here is about the two things that make it more than a proxy: the classifier, which
 * decides which pile a pull request lands in, and the snapshot, which is what lets the page
 * render when GitHub cannot be reached.
 */
describe('Inbox', () => {
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

  const pullRequest = (overrides: Record<string, any> = {}) => ({
    id: `node-${Math.random()}`,
    number: 1,
    title: 'A change',
    url: 'https://github.com/acme/api/pull/1',
    isDraft: false,
    createdAt: '2026-01-01T00:00:00Z',
    repository: { id: 'repo-1', nameWithOwner: 'acme/api' },
    author: { __typename: 'User', login: 'bob', avatarUrl: 'https://avatars/bob' },
    ...overrides,
  });

  const mockInbox = (data: { yours?: any[]; waitingOnYou?: any[]; viewer?: string }) =>
    nock('https://api.github.com')
      .post('/graphql')
      .reply(200, {
        data: {
          viewer: { login: data.viewer ?? 'ada' },
          yours: { nodes: data.yours ?? [] },
          waitingOnYou: { nodes: data.waitingOnYou ?? [] },
        },
      });

  /** No teams is a legitimate answer and the common one; specs that care mock it themselves. */
  const mockNoTeams = () =>
    nock('https://api.github.com').get('/user/teams').query(true).reply(200, []);

  const section = (body: any, half: 'yours' | 'waitingOnYou', key: string) =>
    body[half].find((s: any) => s.key === key);

  describe('classification', () => {
    it('files the viewer own pull requests by what is left to do on them', async () => {
      const { token } = await bootstrap.utils.authUtils.setupUser({
        githubAccessToken: 'gho_token',
      });

      mockInbox({
        yours: [
          pullRequest({ number: 1, reviewDecision: 'APPROVED', reviewThreads: { nodes: [] } }),
          pullRequest({
            number: 2,
            reviewDecision: 'APPROVED',
            reviewThreads: { nodes: [{ isResolved: false }] },
          }),
          pullRequest({ number: 3, reviewThreads: { nodes: [{ isResolved: true }] } }),
          pullRequest({ number: 4, isDraft: true, reviewThreads: { nodes: [] } }),
        ],
      });
      mockNoTeams();

      const { body } = await request(app.getHttpServer())
        .post('/inbox/refresh')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(section(body, 'yours', 'approved').pullRequests).toHaveLength(1);
      expect(section(body, 'yours', 'approved').pullRequests[0].number).toBe(1);

      // Approved *and* still holding an open thread is not "nothing left to do" - somebody is
      // waiting on an answer, so it must not sit under a heading that says it is finished.
      expect(section(body, 'yours', 'unresolved-comments').pullRequests[0].number).toBe(2);

      expect(section(body, 'yours', 'waiting-for-reviewers').pullRequests[0].number).toBe(3);
      expect(section(body, 'yours', 'drafts').pullRequests[0].number).toBe(4);
    });

    it('separates teammates from everyone else and from machines', async () => {
      const { token } = await bootstrap.utils.authUtils.setupUser({
        githubAccessToken: 'gho_token',
      });

      mockInbox({
        waitingOnYou: [
          pullRequest({ number: 10, author: { __typename: 'User', login: 'Bob' } }),
          pullRequest({ number: 11, author: { __typename: 'User', login: 'carol' } }),
          pullRequest({ number: 12, author: { __typename: 'Bot', login: 'renovate' } }),
          pullRequest({ number: 13, author: { __typename: 'User', login: 'sync[bot]' } }),
        ],
      });

      nock('https://api.github.com')
        .get('/user/teams')
        .query(true)
        .reply(200, [{ slug: 'core', organization: { login: 'acme' } }]);
      nock('https://api.github.com')
        .get('/orgs/acme/teams/core/members')
        .query(true)
        .reply(200, [{ login: 'bob' }]);

      const { body } = await request(app.getHttpServer())
        .post('/inbox/refresh')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Matched case-insensitively: GitHub cases a handle however its owner typed it.
      expect(section(body, 'waitingOnYou', 'team').pullRequests[0].number).toBe(10);
      expect(section(body, 'waitingOnYou', 'others').pullRequests[0].number).toBe(11);
      // A GitHub App's account, and the `[bot]` suffix that catches the ones it mistypes.
      expect(
        section(body, 'waitingOnYou', 'bots').pullRequests.map((p: any) => p.number),
      ).toEqual([12, 13]);
    });

    it('puts everyone human in "everyone else" when teams cannot be read', async () => {
      const { token } = await bootstrap.utils.authUtils.setupUser({
        githubAccessToken: 'gho_token',
      });

      mockInbox({
        waitingOnYou: [pullRequest({ number: 10, author: { __typename: 'User', login: 'bob' } })],
      });
      // The app missing its Members permission. Must cost a worse grouping, never the page.
      nock('https://api.github.com').get('/user/teams').query(true).reply(403);

      const { body } = await request(app.getHttpServer())
        .post('/inbox/refresh')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(section(body, 'waitingOnYou', 'team').pullRequests).toHaveLength(0);
      expect(section(body, 'waitingOnYou', 'others').pullRequests[0].number).toBe(10);
    });

    it('does not list the viewer own pull request as waiting on them', async () => {
      const { token } = await bootstrap.utils.authUtils.setupUser({
        githubAccessToken: 'gho_token',
      });

      // GitHub permits it, and a team with review assignment on does it. The row is already
      // under "Yours"; appearing twice would read as two pieces of work.
      mockInbox({
        viewer: 'ada',
        waitingOnYou: [pullRequest({ number: 20, author: { __typename: 'User', login: 'Ada' } })],
      });
      mockNoTeams();

      const { body } = await request(app.getHttpServer())
        .post('/inbox/refresh')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(
        body.waitingOnYou.flatMap((s: any) => s.pullRequests),
      ).toHaveLength(0);
    });

    it('answers with every section, empty ones included', async () => {
      const { token } = await bootstrap.utils.authUtils.setupUser({
        githubAccessToken: 'gho_token',
      });

      mockInbox({});
      mockNoTeams();

      const { body } = await request(app.getHttpServer())
        .post('/inbox/refresh')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // So that finishing the last thing in a pile never makes its heading disappear and
      // reshuffle the page under whoever is reading it.
      expect(body.yours.map((s: any) => s.key)).toEqual([
        'approved',
        'unresolved-comments',
        'waiting-for-reviewers',
        'drafts',
      ]);
      expect(body.waitingOnYou.map((s: any) => s.key)).toEqual(['team', 'others', 'bots']);
    });
  });

  describe('the snapshot', () => {
    /**
     * Seeds a snapshot the only way anything can: by refreshing.
     *
     * Asserts nock is spent afterwards, which is not bookkeeping. An interceptor left unconsumed
     * here goes on to satisfy the *next* request in the test, so a later assertion about GitHub
     * being unreachable quietly passes against a leftover 200 instead. That is exactly how this
     * suite lied about staleness once already.
     */
    const seedSnapshot = async (token: string, prs: any[]) => {
      mockInbox({ yours: prs });
      mockNoTeams();

      await request(app.getHttpServer())
        .post('/inbox/refresh')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(nock.isDone()).toBe(true);
    };

    it('never asks GitHub on a read', async () => {
      const { token } = await bootstrap.utils.authUtils.setupUser({
        githubAccessToken: 'gho_token',
      });

      await seedSnapshot(token, [pullRequest({ number: 1, reviewThreads: { nodes: [] } })]);

      // Asserted against the collaborator rather than against nock. An unmocked call would be
      // swallowed by the data service and the endpoint would answer from the snapshot anyway,
      // so "no interceptor was used" cannot tell these two apart - only "it was never called"
      // can. This is the property the first paint rests on: a read touches nothing but memory.
      const readSpy = jest.spyOn(app.get(GithubInboxDataService), 'read');

      const { body } = await request(app.getHttpServer())
        .get('/inbox')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(readSpy).not.toHaveBeenCalled();
      expect(section(body, 'yours', 'waiting-for-reviewers').pullRequests).toHaveLength(1);
      expect(body.stale).toBe(false);
      expect(body.refreshedAt).toBeDefined();

      readSpy.mockRestore();
    });

    it('answers a read with no refreshedAt before anything has been built', async () => {
      const { token } = await bootstrap.utils.authUtils.setupUser({
        githubAccessToken: 'gho_token',
      });

      const { body } = await request(app.getHttpServer())
        .get('/inbox')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // The distinction the page depends on to avoid telling somebody their inbox is empty
      // while it is still being fetched. Every section is present; nothing has answered yet.
      expect(body.refreshedAt).toBeUndefined();
      expect(body.yours.flatMap((s: any) => s.pullRequests)).toHaveLength(0);
      expect(body.waitingOnYou.flatMap((s: any) => s.pullRequests)).toHaveLength(0);
    });

    it('serves the last answer, flagged, when a refresh cannot reach GitHub', async () => {
      const { token } = await bootstrap.utils.authUtils.setupUser({
        githubAccessToken: 'gho_token',
      });

      await seedSnapshot(token, [pullRequest({ number: 1, reviewThreads: { nodes: [] } })]);

      // Deliberately not clearing the process cache here: the snapshot now lives in it, and
      // wiping it would remove the very thing this asserts is served.
      nock('https://api.github.com').post('/graphql').reply(502);

      const { body } = await request(app.getHttpServer())
        .post('/inbox/refresh')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Rows somebody has seen before beat an empty page. They were true when GitHub last
      // answered, so they go out with `stale` rather than being thrown away.
      expect(section(body, 'yours', 'waiting-for-reviewers').pullRequests).toHaveLength(1);
      expect(body.stale).toBe(true);
      expect(body.refreshedAt).toBeDefined();
    });

    it('forgets a snapshot once its process does', async () => {
      const { token } = await bootstrap.utils.authUtils.setupUser({
        githubAccessToken: 'gho_token',
      });

      await seedSnapshot(token, [pullRequest({ number: 1, reviewThreads: { nodes: [] } })]);

      // Standing in for a redeploy. The snapshot is a copy of what GitHub said and nothing else,
      // so losing it costs one empty first paint and never any data.
      bootstrap.services.inMemoryCacheService.clear();

      const { body } = await request(app.getHttpServer())
        .get('/inbox')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(body.refreshedAt).toBeUndefined();
      expect(body.yours.flatMap((s: any) => s.pullRequests)).toHaveLength(0);
    });

    it('reports a missing GitHub authorization without ending the proke session', async () => {
      const { token } = await bootstrap.utils.authUtils.setupUser();

      const { body } = await request(app.getHttpServer())
        .post('/inbox/refresh')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // A 401 here is what the frontend interceptor reads as a dead session, and it would sign
      // the user out of a perfectly good account over a revoked GitHub grant.
      expect(body.githubReauthRequired).toBe(true);
      expect(body.yours.flatMap((s: any) => s.pullRequests)).toHaveLength(0);
    });

    it('drops a token GitHub has rejected', async () => {
      const { token, user } = await bootstrap.utils.authUtils.setupUser({
        githubAccessToken: 'gho_revoked',
      });

      nock('https://api.github.com').post('/graphql').reply(401);

      const { body } = await request(app.getHttpServer())
        .post('/inbox/refresh')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(body.githubReauthRequired).toBe(true);

      // Cleared, so the next sweep does not present a dead credential on every pass.
      const stored = await bootstrap.services.userReadService.readByIdOrThrow(user.id);
      expect(stored.githubAccessToken).toBeUndefined();
    });

    it('refuses an unauthenticated caller on both routes', async () => {
      await request(app.getHttpServer()).get('/inbox').expect(401);
      await request(app.getHttpServer()).post('/inbox/refresh').expect(401);
    });
  });
});

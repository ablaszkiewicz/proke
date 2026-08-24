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
    // Long enough ago that nothing built on this fixture is accidentally "recent". Anything
    // testing the recency window says so, in the test, with a timestamp of its own.
    updatedAt: '2020-01-01T00:00:00Z',
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

  /** Teams of one organisation and who is in each, as the two endpoints behind them answer. */
  const mockTeams = (members: Record<string, string[]>) => {
    nock('https://api.github.com')
      .get('/user/teams')
      .query(true)
      .reply(
        200,
        Object.keys(members).map((slug) => ({
          slug,
          name: slug.charAt(0).toUpperCase() + slug.slice(1),
          organization: { login: 'acme' },
        })),
      );

    for (const [slug, logins] of Object.entries(members)) {
      nock('https://api.github.com')
        .get(`/orgs/acme/teams/${slug}/members`)
        .query(true)
        .reply(
          200,
          logins.map((login) => ({ login })),
        );
    }
  };

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

    it('separates the drafts you are working on from the drafts you have put down', async () => {
      const { token } = await bootstrap.utils.authUtils.setupUser({
        githubAccessToken: 'gho_token',
      });

      const hoursAgo = (hours: number) =>
        new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

      mockInbox({
        yours: [
          pullRequest({ number: 1, isDraft: true, updatedAt: hoursAgo(1), reviewThreads: { nodes: [] } }),
          // The overnight case the window exists for: pushed to yesterday evening, opened again
          // this morning, and still the thing you are in the middle of.
          pullRequest({ number: 2, isDraft: true, updatedAt: hoursAgo(20), reviewThreads: { nodes: [] } }),
          pullRequest({ number: 3, isDraft: true, updatedAt: hoursAgo(30), reviewThreads: { nodes: [] } }),
          pullRequest({ number: 4, isDraft: true, reviewThreads: { nodes: [] } }),
        ],
      });
      mockNoTeams();

      const { body } = await request(app.getHttpServer())
        .post('/inbox/refresh')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(
        section(body, 'yours', 'recent-drafts').pullRequests.map((p: any) => p.number),
      ).toEqual([1, 2]);
      expect(
        section(body, 'yours', 'drafts').pullRequests.map((p: any) => p.number),
      ).toEqual([3, 4]);
    });

    it('moves the line between the two drafts piles to where the reader put it', async () => {
      const { token } = await bootstrap.utils.authUtils.setupUser({
        githubAccessToken: 'gho_token',
      });

      const hoursAgo = (hours: number) =>
        new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

      mockInbox({
        yours: [
          pullRequest({ number: 1, isDraft: true, updatedAt: hoursAgo(2), reviewThreads: { nodes: [] } }),
          // Recent under the default day and not under six hours, which is the whole point of
          // the setting: whose day is whose is not ours to decide.
          pullRequest({ number: 2, isDraft: true, updatedAt: hoursAgo(20), reviewThreads: { nodes: [] } }),
        ],
      });
      mockNoTeams();

      const { body } = await request(app.getHttpServer())
        .post('/inbox/refresh')
        .query({ recentDrafts: '6h' })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(
        section(body, 'yours', 'recent-drafts').pullRequests.map((p: any) => p.number),
      ).toEqual([1]);
      expect(
        section(body, 'yours', 'drafts').pullRequests.map((p: any) => p.number),
      ).toEqual([2]);
    });

    it('puts every draft in the one pile when the reader turns the split off', async () => {
      const { token } = await bootstrap.utils.authUtils.setupUser({
        githubAccessToken: 'gho_token',
      });

      mockInbox({
        yours: [
          // Pushed to a moment ago, so under any window at all this would be the recent one.
          pullRequest({
            number: 1,
            isDraft: true,
            updatedAt: new Date().toISOString(),
            reviewThreads: { nodes: [] },
          }),
          pullRequest({ number: 2, isDraft: true, reviewThreads: { nodes: [] } }),
        ],
      });
      mockNoTeams();

      const { body } = await request(app.getHttpServer())
        .post('/inbox/refresh')
        .query({ recentDrafts: 'off' })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // The heading is still in the answer - every section always is - but it is empty, which is
      // how the client stops drawing it. Nothing about "off" is a special case on either side.
      expect(section(body, 'yours', 'recent-drafts').pullRequests).toEqual([]);
      expect(
        section(body, 'yours', 'drafts').pullRequests.map((p: any) => p.number),
      ).toEqual([1, 2]);
    });

    it('orders every section by when GitHub last saw the pull request move', async () => {
      const { token } = await bootstrap.utils.authUtils.setupUser({
        githubAccessToken: 'gho_token',
      });

      mockInbox({
        yours: [
          pullRequest({ number: 1, updatedAt: '2026-03-01T00:00:00Z', reviewThreads: { nodes: [] } }),
          pullRequest({ number: 2, updatedAt: '2026-05-01T00:00:00Z', reviewThreads: { nodes: [] } }),
          pullRequest({ number: 3, updatedAt: '2026-04-01T00:00:00Z', reviewThreads: { nodes: [] } }),
        ],
        waitingOnYou: [
          pullRequest({ number: 10, updatedAt: '2026-04-01T00:00:00Z' }),
          pullRequest({ number: 11, updatedAt: '2026-06-01T00:00:00Z' }),
        ],
      });
      mockNoTeams();

      const { body } = await request(app.getHttpServer())
        .post('/inbox/refresh')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Newest first, on both halves. What moved last is what is live.
      expect(
        section(body, 'yours', 'waiting-for-reviewers').pullRequests.map((p: any) => p.number),
      ).toEqual([2, 3, 1]);
      expect(
        section(body, 'waitingOnYou', 'others').pullRequests.map((p: any) => p.number),
      ).toEqual([11, 10]);
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
      // Newest first, and these two share a timestamp - so the tie falls to the newer pull
      // request, which is what puts 13 above 12.
      expect(
        section(body, 'waitingOnYou', 'bots').pullRequests.map((p: any) => p.number),
      ).toEqual([13, 12]);
    });

    it('merges the team and bots headings into "everyone else" when they are switched off', async () => {
      const { token } = await bootstrap.utils.authUtils.setupUser({
        githubAccessToken: 'gho_token',
      });

      mockInbox({
        waitingOnYou: [
          pullRequest({ number: 10, author: { __typename: 'User', login: 'bob' } }),
          pullRequest({ number: 11, author: { __typename: 'User', login: 'carol' } }),
          pullRequest({ number: 12, author: { __typename: 'Bot', login: 'renovate' } }),
        ],
      });
      mockTeams({ core: ['bob'] });

      const { body } = await request(app.getHttpServer())
        .post('/inbox/refresh')
        .query({ separateTeam: 'false', separateBots: 'false' })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Off means "in with everyone else", never "gone": every one of the three is still a pull
      // request waiting on this reader, and a switch about headings must not remove work.
      expect(section(body, 'waitingOnYou', 'team').pullRequests).toEqual([]);
      expect(section(body, 'waitingOnYou', 'bots').pullRequests).toEqual([]);
      expect(
        section(body, 'waitingOnYou', 'others').pullRequests.map((p: any) => p.number).sort(),
      ).toEqual([10, 11, 12]);
    });

    it('stops a struck-out team making somebody a teammate', async () => {
      const { token } = await bootstrap.utils.authUtils.setupUser({
        githubAccessToken: 'gho_token',
      });

      mockInbox({
        waitingOnYou: [
          pullRequest({ number: 10, author: { __typename: 'User', login: 'bob' } }),
          pullRequest({ number: 11, author: { __typename: 'User', login: 'carol' } }),
        ],
      });
      // Bob is only in the company-wide team; Carol is in that and in the reader's own.
      mockTeams({ everyone: ['bob', 'carol'], core: ['carol'] });

      const { body } = await request(app.getHttpServer())
        .post('/inbox/refresh')
        .query({ excludedTeams: 'acme/everyone' })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(section(body, 'waitingOnYou', 'others').pullRequests[0].number).toBe(10);
      // Still a teammate on the strength of the team that was not struck out. Excluding one
      // broad team must not quietly remove the people it was never about.
      expect(section(body, 'waitingOnYou', 'team').pullRequests[0].number).toBe(11);
    });

    it('drops pull requests from an ignored author entirely', async () => {
      const { token } = await bootstrap.utils.authUtils.setupUser({
        githubAccessToken: 'gho_token',
      });

      mockInbox({
        waitingOnYou: [
          pullRequest({ number: 10, author: { __typename: 'Bot', login: 'Dependabot' } }),
          pullRequest({ number: 11, author: { __typename: 'User', login: 'carol' } }),
        ],
      });
      mockNoTeams();

      const { body } = await request(app.getHttpServer())
        .post('/inbox/refresh')
        // Cased the other way round from GitHub's answer, because the reader typed it.
        .query({ ignoredAuthors: 'dependabot' })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(
        body.waitingOnYou.flatMap((s: any) => s.pullRequests).map((p: any) => p.number),
      ).toEqual([11]);
    });

    it('serves every combination of the author settings from one stored snapshot', async () => {
      const { token } = await bootstrap.utils.authUtils.setupUser({
        githubAccessToken: 'gho_token',
      });

      mockInbox({
        waitingOnYou: [
          pullRequest({ number: 10, author: { __typename: 'User', login: 'bob' } }),
          pullRequest({ number: 11, author: { __typename: 'Bot', login: 'renovate' } }),
        ],
      });
      mockTeams({ core: ['bob'] });

      await request(app.getHttpServer())
        .post('/inbox/refresh')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(nock.isDone()).toBe(true);

      // The point of the whole build/view split: these are applied to the stored document on the
      // way out, so a reader moving one of them is answered from what is already here. No GitHub
      // interceptor is armed, so anything that went and asked would fail this outright.
      const { body } = await request(app.getHttpServer())
        .get('/inbox')
        .query({ separateTeam: 'false', ignoredAuthors: 'renovate' })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(body.refreshedAt).toBeDefined();
      expect(
        body.waitingOnYou.flatMap((s: any) => s.pullRequests).map((p: any) => p.number),
      ).toEqual([10]);
      expect(section(body, 'waitingOnYou', 'others').pullRequests[0].number).toBe(10);
    });

    it('answers with the teams the grouping was built from', async () => {
      const { token } = await bootstrap.utils.authUtils.setupUser({
        githubAccessToken: 'gho_token',
      });

      mockInbox({});
      mockTeams({ core: ['bob'] });

      const { body } = await request(app.getHttpServer())
        .post('/inbox/refresh')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // So the settings can list them and let somebody strike one out. Without this the "your
      // team" rule is invisible to exactly the person it groups wrongly.
      expect(body.teams).toEqual([
        { key: 'acme/core', org: 'acme', slug: 'core', name: 'Core' },
      ]);
    });

    it('leaves the teams out rather than empty when GitHub would not say', async () => {
      const { token } = await bootstrap.utils.authUtils.setupUser({
        githubAccessToken: 'gho_token',
      });

      mockInbox({});
      nock('https://api.github.com').get('/user/teams').query(true).reply(403);

      const { body } = await request(app.getHttpServer())
        .post('/inbox/refresh')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Absent and empty are the same picture and opposite instructions: one says "you are in no
      // teams", the other says "we could not find out". The settings say different things about
      // each, so the response has to keep them apart.
      expect(body.teams).toBeUndefined();
    });

    it('rejects a name list that is too long or full of the wrong characters', async () => {
      const { token } = await bootstrap.utils.authUtils.setupUser({
        githubAccessToken: 'gho_token',
      });

      await request(app.getHttpServer())
        .get('/inbox')
        .query({ ignoredAuthors: 'someone with spaces' })
        .set('Authorization', `Bearer ${token}`)
        .expect(400);

      await request(app.getHttpServer())
        .get('/inbox')
        .query({
          excludedTeams: Array.from({ length: 51 }, (_, i) => `acme/team-${i}`).join(','),
        })
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });

    it('takes an empty name list as ignoring nobody', async () => {
      const { token } = await bootstrap.utils.authUtils.setupUser({
        githubAccessToken: 'gho_token',
      });

      mockInbox({
        waitingOnYou: [pullRequest({ number: 10, author: { __typename: 'User', login: 'bob' } })],
      });
      mockNoTeams();

      // The shape a client that always sends every filter produces. It has to mean "nobody"
      // rather than "a list with one empty name in it", which would match nothing and look fine.
      const { body } = await request(app.getHttpServer())
        .post('/inbox/refresh')
        .query({ ignoredAuthors: '', excludedTeams: '' })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(section(body, 'waitingOnYou', 'others').pullRequests[0].number).toBe(10);
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

    it('leaves out a pull request somebody has already approved', async () => {
      const { token } = await bootstrap.utils.authUtils.setupUser({
        githubAccessToken: 'gho_token',
      });

      mockInbox({
        waitingOnYou: [
          pullRequest({ number: 30, reviewDecision: 'APPROVED' }),
          pullRequest({ number: 31, reviewDecision: 'REVIEW_REQUIRED' }),
          pullRequest({ number: 32 }),
        ],
      });
      mockNoTeams();

      const { body } = await request(app.getHttpServer())
        .post('/inbox/refresh')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // The default. The review it was asking for has happened, so leaving it in the pile makes
      // the pile a worse answer to "what is left to do". Ordered newest first, and they share a
      // timestamp here, so the tie falls to the newer pull request.
      expect(
        body.waitingOnYou.flatMap((s: any) => s.pullRequests).map((p: any) => p.number),
      ).toEqual([32, 31]);
    });

    it('keeps approved pull requests when the reader asks for them', async () => {
      const { token } = await bootstrap.utils.authUtils.setupUser({
        githubAccessToken: 'gho_token',
      });

      mockInbox({
        waitingOnYou: [
          pullRequest({ number: 30, reviewDecision: 'APPROVED' }),
          pullRequest({ number: 31 }),
        ],
      });
      mockNoTeams();

      const { body } = await request(app.getHttpServer())
        .post('/inbox/refresh')
        .query({ includeApproved: 'true' })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(
        body.waitingOnYou.flatMap((s: any) => s.pullRequests).map((p: any) => p.number),
      ).toEqual([31, 30]);
    });

    it('never applies the approved filter to your own pull requests', async () => {
      const { token } = await bootstrap.utils.authUtils.setupUser({
        githubAccessToken: 'gho_token',
      });

      // Your own approved pull request is the one with a button left to press. It is the
      // opposite of finished, and the filter that hides other people's must not reach it.
      mockInbox({
        yours: [
          pullRequest({ number: 40, reviewDecision: 'APPROVED', reviewThreads: { nodes: [] } }),
        ],
      });
      mockNoTeams();

      const { body } = await request(app.getHttpServer())
        .post('/inbox/refresh')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(section(body, 'yours', 'approved').pullRequests[0].number).toBe(40);
    });

    it('rejects a filter that is not a boolean', async () => {
      const { token } = await bootstrap.utils.authUtils.setupUser({
        githubAccessToken: 'gho_token',
      });

      // Rather than coercing it. A typo reading as "off" would silently hide rows, which is the
      // one thing a filter must never do by accident.
      await request(app.getHttpServer())
        .get('/inbox')
        .query({ includeApproved: 'yes' })
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });

    it('rejects a window that is not one of the offered ones', async () => {
      const { token } = await bootstrap.utils.authUtils.setupUser({
        githubAccessToken: 'gho_token',
      });

      // For the same reason, and for one more: the value ends up in the key a snapshot is filed
      // under, so anything accepted here is a cache entry somebody can ask for by typing.
      await request(app.getHttpServer())
        .get('/inbox')
        .query({ recentDrafts: '4h' })
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
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
        'recent-drafts',
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

    it('is filed under the filters it was built with', async () => {
      const { token } = await bootstrap.utils.authUtils.setupUser({
        githubAccessToken: 'gho_token',
      });

      mockInbox({ waitingOnYou: [pullRequest({ number: 30, reviewDecision: 'APPROVED' })] });
      mockNoTeams();

      await request(app.getHttpServer())
        .post('/inbox/refresh')
        .query({ includeApproved: 'true' })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(nock.isDone()).toBe(true);

      // A filter removes its rows before they are ever written down, so this snapshot is only an
      // answer to the question that built it. Served under the default settings it would show a
      // pull request that reader has asked not to see - so it is not served at all, and the
      // refresh the client fires alongside the read fills the gap.
      const { body: unfiltered } = await request(app.getHttpServer())
        .get('/inbox')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(unfiltered.refreshedAt).toBeUndefined();

      // And the one that was built is still there, untouched by the read that missed.
      const { body: stored } = await request(app.getHttpServer())
        .get('/inbox')
        .query({ includeApproved: 'true' })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(stored.refreshedAt).toBeDefined();
      expect(stored.waitingOnYou.flatMap((s: any) => s.pullRequests)).toHaveLength(1);
    });

    it('refuses an unauthenticated caller on both routes', async () => {
      await request(app.getHttpServer()).get('/inbox').expect(401);
      await request(app.getHttpServer()).post('/inbox/refresh').expect(401);
    });
  });
});

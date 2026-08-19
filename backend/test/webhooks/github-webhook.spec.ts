import { createHmac, generateKeyPairSync } from 'crypto';
import * as nock from 'nock';
import * as request from 'supertest';
import { NotificationType } from '../../src/notifications/core/entities/notification-type.enum';
import { RepositoryScope } from '../../src/subscriptions/core/entities/subscription.interface';
import { createTestApp } from '../utils/bootstrap';
import { waitFor } from '../utils/wait-for';

const WEBHOOK_SECRET = 'test-webhook-secret';

describe('Webhooks (github)', () => {
  let bootstrap: Awaited<ReturnType<typeof createTestApp>>;
  let deliverSpy: jest.SpyInstance;

  beforeAll(async () => {
    process.env.GH_APP_WEBHOOK_SECRET = WEBHOOK_SECRET;

    // Expanding a team mention starts by signing an app JWT, so it needs a key that signs.
    const { privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });

    process.env.GH_APP_ID = '12345';
    process.env.GH_APP_PRIVATE_KEY = privateKey as string;

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

  const send = (event: string, payload: object, secret = WEBHOOK_SECRET) => {
    const body = JSON.stringify(payload);
    const signature = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');

    return request(bootstrap.app.getHttpServer())
      .post('/webhooks/github')
      .set('content-type', 'application/json')
      .set('x-github-event', event)
      .set('x-hub-signature-256', signature)
      .send(body);
  };

  const INSTALLATION_ID = '5150';
  // Public on purpose. Routing is what these specs are about, and a public repository is the
  // one case where nobody has to be asked whether they may see it - so the access check stays
  // out of the way here and gets a describe block of its own below.
  const REPOSITORY = { id: 314, full_name: 'ablaszkiewicz/proke', private: false };
  const OTHER_REPOSITORY = { id: 271, full_name: 'ablaszkiewicz/other', private: false };

  /**
   * Opting the user in is what authorises a poke; installing alone is not enough. Written with
   * no preference fields by default, which is exactly the shape of a row from before
   * preferences existed - so most of these tests double as a regression test for that.
   */
  const subscribe = async (userId: string, overrides: object = {}) => {
    await bootstrap.models.subscriptionModel.create({
      userId,
      installationId: INSTALLATION_ID,
      ...overrides,
    });
  };

  /**
   * Nothing delivered is proven by a quiet interval - there is no event to wait for. The window
   * a review is held open in is closed by hand afterwards, so that a poke merely being held
   * cannot read as a poke that was suppressed.
   */
  const expectNoPoke = async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    await bootstrap.services.reviewBatchService.flushAll();
    expect(deliverSpy).not.toHaveBeenCalled();
  };

  const firstNotification = async () => {
    await waitFor(() => deliverSpy.mock.calls.length > 0);
    return deliverSpy.mock.calls[0][1];
  };

  const reviewRequestedPayload = (reviewerGithubId: number, senderGithubId = 999) => ({
    action: 'review_requested',
    installation: { id: Number(INSTALLATION_ID) },
    requested_reviewer: { id: reviewerGithubId, login: 'reviewer' },
    pull_request: {
      title: 'Wire up webhooks',
      html_url: 'https://github.com/ablaszkiewicz/proke/pull/9',
      user: { id: senderGithubId, login: 'author' },
    },
    repository: REPOSITORY,
    sender: { id: senderGithubId, login: 'author' },
  });

  /** GitHub delivers pull request conversation comments as `issue_comment`. */
  const prCommentPayload = (
    { body, authorGithubId = 4242 }: { body?: string; authorGithubId?: number } = {},
    repository = REPOSITORY,
  ) => ({
    action: 'created',
    installation: { id: Number(INSTALLATION_ID) },
    issue: {
      title: 'Something is broken',
      pull_request: { html_url: 'https://github.com/ablaszkiewicz/proke/pull/3' },
      user: { id: authorGithubId, login: 'author' },
    },
    comment: {
      html_url: 'https://github.com/ablaszkiewicz/proke/pull/3#issuecomment-1',
      body,
    },
    repository,
    sender: { id: 999, login: 'commenter' },
  });

  // Shared by every test about a team, whether the team was named in a sentence or asked for a
  // review: both end up in the same expansion, and so need the same org-owned repository, the
  // same installation token, and the same answer from GitHub about who is in the team.
  const ORG = 'acme';
  const ORG_REPOSITORY = { id: 314, full_name: 'acme/proke', private: false };

  const mockInstallationToken = () =>
    nock('https://api.github.com')
      .post(`/app/installations/${INSTALLATION_ID}/access_tokens`)
      .reply(201, {
        token: 'ghs_installation',
        expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
      });

  /** `overCap` is how GitHub says there is more: a Link header offering a second page. */
  const mockTeamMembers = (
    slug: string,
    members: { id: number; login: string }[],
    { overCap = false, org = ORG }: { overCap?: boolean; org?: string } = {},
  ) =>
    nock('https://api.github.com')
      .get(`/orgs/${org}/teams/${slug}/members`)
      .query({ per_page: '100' })
      .reply(
        200,
        members,
        overCap
          ? {
              link: `<https://api.github.com/orgs/${org}/teams/${slug}/members?page=2>; rel="next"`,
            }
          : {},
      );

  const setupMember = async (githubId: string, githubLogin: string) => {
    const { user } = await bootstrap.utils.authUtils.setupUser({ githubId, githubLogin });
    await subscribe(user.id);
    return user;
  };

  describe('signature verification', () => {
    it('rejects a wrong signature', async () => {
      // when
      const response = await send('ping', { zen: 'hi' }, 'not-the-secret');

      // then
      expect(response.status).toEqual(401);
    });

    it('rejects a missing signature', async () => {
      // when
      const response = await request(bootstrap.app.getHttpServer())
        .post('/webhooks/github')
        .set('content-type', 'application/json')
        .set('x-github-event', 'ping')
        .send(JSON.stringify({ zen: 'hi' }));

      // then
      expect(response.status).toEqual(401);
    });

    it('accepts a correct signature', async () => {
      // when
      const response = await send('ping', { zen: 'hi' });

      // then
      expect(response.status).toEqual(202);
    });

    it('rejects a body altered after signing', async () => {
      // given - sign one body, send another
      const signature =
        'sha256=' + createHmac('sha256', WEBHOOK_SECRET).update('{"a":1}').digest('hex');

      // when
      const response = await request(bootstrap.app.getHttpServer())
        .post('/webhooks/github')
        .set('content-type', 'application/json')
        .set('x-github-event', 'ping')
        .set('x-hub-signature-256', signature)
        .send('{"a":2}');

      // then
      expect(response.status).toEqual(401);
    });
  });

  describe('routing', () => {
    it('pokes the requested reviewer', async () => {
      // given
      const { user } = await bootstrap.utils.authUtils.setupUser({
        githubId: '4242',
        githubLogin: 'reviewer',
      });
      await subscribe(user.id);

      // when
      await send('pull_request', reviewRequestedPayload(4242));

      // then
      expect(await firstNotification()).toMatchObject({
        type: NotificationType.ReviewRequested,
        title: 'Wire up webhooks',
        htmlUrl: 'https://github.com/ablaszkiewicz/proke/pull/9',
        repositoryFullName: 'ablaszkiewicz/proke',
        actorLogin: 'author',
      });
    });

    it('ignores a reviewer who is not a proke user', async () => {
      // when - nobody in the db has this github id
      await send('pull_request', reviewRequestedPayload(4242));

      // then
      await expectNoPoke();
    });

    it('never pokes someone about their own action', async () => {
      // given - the sender and the recipient are the same person
      const { user } = await bootstrap.utils.authUtils.setupUser({
        githubId: '4242',
        githubLogin: 'reviewer',
      });
      await subscribe(user.id);

      // when
      await send('pull_request', reviewRequestedPayload(4242, 4242));

      // then
      await expectNoPoke();
    });

    it('pokes the pr author about a comment', async () => {
      // given
      const { user } = await bootstrap.utils.authUtils.setupUser({
        githubId: '4242',
        githubLogin: 'author',
      });
      await subscribe(user.id);

      // when
      await send('issue_comment', prCommentPayload());

      // then
      expect(await firstNotification()).toMatchObject({
        type: NotificationType.PullRequestComment,
        title: 'Something is broken',
        actorLogin: 'commenter',
      });
    });

    it('leaves a comment on an issue you opened alone', async () => {
      // given - the same event, minus the field that makes it a pull request
      const { user } = await bootstrap.utils.authUtils.setupUser({
        githubId: '4242',
        githubLogin: 'author',
      });
      await subscribe(user.id);
      const { issue, ...rest } = prCommentPayload();
      const { pull_request, ...plainIssue } = issue;

      // when
      await send('issue_comment', { ...rest, issue: plainIssue });

      // then - only a mention makes an issue comment a poke
      await expectNoPoke();
    });

    it('pokes the pr author about a submitted review', async () => {
      // given
      const { user } = await bootstrap.utils.authUtils.setupUser({
        githubId: '4242',
        githubLogin: 'author',
      });
      await subscribe(user.id);

      // when
      await send('pull_request_review', {
        action: 'submitted',
        installation: { id: Number(INSTALLATION_ID) },
        review: { html_url: 'https://github.com/ablaszkiewicz/proke/pull/9#pullrequestreview-1' },
        pull_request: {
          title: 'Wire up webhooks',
          html_url: 'https://github.com/ablaszkiewicz/proke/pull/9',
          user: { id: 4242, login: 'author' },
        },
        repository: REPOSITORY,
        sender: { id: 999, login: 'reviewer' },
      });

      // then
      expect(await firstNotification()).toMatchObject({
        type: NotificationType.ReviewSubmitted,
      });
    });

    it('pokes the author when their pull request is merged', async () => {
      // given
      const { user } = await bootstrap.utils.authUtils.setupUser({
        githubId: '4242',
        githubLogin: 'author',
      });
      await subscribe(user.id);

      // when
      await send('pull_request', {
        action: 'closed',
        installation: { id: Number(INSTALLATION_ID) },
        pull_request: {
          title: 'Wire up webhooks',
          html_url: 'https://github.com/ablaszkiewicz/proke/pull/9',
          merged: true,
          user: { id: 4242, login: 'author' },
        },
        repository: REPOSITORY,
        sender: { id: 999, login: 'maintainer' },
      });

      // then
      expect(await firstNotification()).toMatchObject({
        type: NotificationType.PullRequestMerged,
        title: 'Wire up webhooks',
      });
    });

    it('pokes the author when somebody enables auto-merge on their pull request', async () => {
      // given
      const { user } = await bootstrap.utils.authUtils.setupUser({
        githubId: '4242',
        githubLogin: 'author',
      });
      await subscribe(user.id);

      // when
      await send('pull_request', {
        action: 'auto_merge_enabled',
        installation: { id: Number(INSTALLATION_ID) },
        pull_request: {
          title: 'Wire up webhooks',
          html_url: 'https://github.com/ablaszkiewicz/proke/pull/9',
          user: { id: 4242, login: 'author' },
        },
        repository: REPOSITORY,
        sender: { id: 999, login: 'maintainer' },
      });

      // then
      expect(await firstNotification()).toMatchObject({
        type: NotificationType.AutoMergeEnabled,
        title: 'Wire up webhooks',
      });
    });

    it('pokes the author when a bot enables auto-merge on their pull request', async () => {
      // given
      const { user } = await bootstrap.utils.authUtils.setupUser({
        githubId: '4242',
        githubLogin: 'author',
      });
      await subscribe(user.id);

      // when
      await send('pull_request', {
        action: 'auto_merge_enabled',
        installation: { id: Number(INSTALLATION_ID) },
        pull_request: {
          title: 'Wire up webhooks',
          user: { id: 4242, login: 'author' },
        },
        repository: REPOSITORY,
        sender: { id: 999, login: 'mergify[bot]', type: 'Bot' },
      });

      // then - what a bot says is noise; what it does to your branch is not
      expect(await firstNotification()).toMatchObject({
        type: NotificationType.AutoMergeEnabled,
      });
    });

    it('says nothing when authors enable auto-merge on their own pull request', async () => {
      // given
      const { user } = await bootstrap.utils.authUtils.setupUser({
        githubId: '4242',
        githubLogin: 'author',
      });
      await subscribe(user.id);

      // when
      await send('pull_request', {
        action: 'auto_merge_enabled',
        installation: { id: Number(INSTALLATION_ID) },
        pull_request: {
          title: 'Wire up webhooks',
          user: { id: 4242, login: 'author' },
        },
        repository: REPOSITORY,
        sender: { id: 4242, login: 'author' },
      });

      // then - the common case by far, and nobody needs telling what they just did themselves
      await expectNoPoke();
    });

    it('says nothing when auto-merge is turned back off', async () => {
      // given
      const { user } = await bootstrap.utils.authUtils.setupUser({
        githubId: '4242',
        githubLogin: 'author',
      });
      await subscribe(user.id);

      // when
      await send('pull_request', {
        action: 'auto_merge_disabled',
        installation: { id: Number(INSTALLATION_ID) },
        pull_request: {
          title: 'Wire up webhooks',
          user: { id: 4242, login: 'author' },
        },
        repository: REPOSITORY,
        sender: { id: 999, login: 'maintainer' },
      });

      // then - a plan called off is not news the way the plan itself was
      await expectNoPoke();
    });

    it('says nothing when a pull request is closed without merging', async () => {
      // given
      const { user } = await bootstrap.utils.authUtils.setupUser({
        githubId: '4242',
        githubLogin: 'author',
      });
      await subscribe(user.id);

      // when
      await send('pull_request', {
        action: 'closed',
        installation: { id: Number(INSTALLATION_ID) },
        pull_request: {
          title: 'Wire up webhooks',
          merged: false,
          user: { id: 4242, login: 'author' },
        },
        repository: REPOSITORY,
        sender: { id: 999, login: 'maintainer' },
      });

      // then - having your work abandoned is not a notification anyone asked for
      await expectNoPoke();
    });

    it('does not poke a user who has not opted in to that installation', async () => {
      // given - registered, the app is installed on their org, but no subscription
      await bootstrap.utils.authUtils.setupUser({ githubId: '4242', githubLogin: 'reviewer' });

      // when
      await send('pull_request', reviewRequestedPayload(4242));

      // then - installation is a colleague's decision; being poked is theirs
      await expectNoPoke();
    });

    it('does not poke across installations the user did not opt in to', async () => {
      // given - opted in to a different org's installation
      const { user } = await bootstrap.utils.authUtils.setupUser({
        githubId: '4242',
        githubLogin: 'reviewer',
      });
      await bootstrap.models.subscriptionModel.create({
        userId: user.id,
        installationId: '9999',
      });

      // when - the event belongs to installation 5150
      await send('pull_request', reviewRequestedPayload(4242));

      // then
      await expectNoPoke();
    });

    it('drops an event with no installation id rather than guessing', async () => {
      // given
      const { user } = await bootstrap.utils.authUtils.setupUser({ githubId: '4242' });
      await subscribe(user.id);

      // when
      const { installation, ...withoutInstallation } = reviewRequestedPayload(4242);
      await send('pull_request', withoutInstallation);

      // then
      await expectNoPoke();
    });

    it('ignores actions we do not care about', async () => {
      // given
      await bootstrap.utils.authUtils.setupUser({ githubId: '4242' });

      // when - a PR being labelled is not a poke
      await send('pull_request', {
        action: 'labeled',
        installation: { id: Number(INSTALLATION_ID) },
        pull_request: { title: 'x', user: { id: 4242 } },
        repository: REPOSITORY,
        sender: { id: 999 },
      });

      // then
      await expectNoPoke();
    });
  });

  describe('mentions', () => {
    it('pokes someone mentioned in a pull request comment', async () => {
      // given - not the author, just named in the body
      const { user } = await bootstrap.utils.authUtils.setupUser({
        githubId: '4242',
        githubLogin: 'ablaszkiewicz',
      });
      await subscribe(user.id);

      // when
      await send(
        'issue_comment',
        prCommentPayload({ body: 'cc @ablaszkiewicz can you look?', authorGithubId: 7000 }),
      );

      // then
      expect(await firstNotification()).toMatchObject({
        type: NotificationType.PullRequestMention,
        actorLogin: 'commenter',
        // The text that named them travels with the poke - it is the reason for it.
        excerpt: 'cc @ablaszkiewicz can you look?',
      });
    });

    it('carries the comment text on a poke to the pull request author', async () => {
      // given - the author is poked by id, not by being named
      const { user } = await bootstrap.utils.authUtils.setupUser({
        githubId: '4242',
        githubLogin: 'ablaszkiewicz',
      });
      await subscribe(user.id);

      // when
      await send('issue_comment', prCommentPayload({ body: 'This breaks on Windows.' }));

      // then
      expect(await firstNotification()).toMatchObject({
        type: NotificationType.PullRequestComment,
        excerpt: 'This breaks on Windows.',
      });
    });

    it('drops an unfilled template rather than quoting its instructions', async () => {
      // given - a description that is entirely HTML comments says nothing
      const { user } = await bootstrap.utils.authUtils.setupUser({
        githubId: '4242',
        githubLogin: 'ablaszkiewicz',
      });
      await subscribe(user.id);

      // when
      await send(
        'issue_comment',
        prCommentPayload({
          body: '<!-- Describe your change -->\n\n@ablaszkiewicz\n\n<!-- Checklist -->',
          authorGithubId: 7000,
        }),
      );

      // then
      expect(await firstNotification()).toMatchObject({ excerpt: '@ablaszkiewicz' });
    });

    it('leaves the excerpt off an event with no words in it', async () => {
      // given
      const { user } = await bootstrap.utils.authUtils.setupUser({
        githubId: '4242',
        githubLogin: 'ablaszkiewicz',
      });
      await subscribe(user.id);

      // when - a review request carries no message
      await send('pull_request', reviewRequestedPayload(4242));

      // then
      expect((await firstNotification()).excerpt).toBeUndefined();
    });

    it('carries the number and the review verdict off the payload', async () => {
      // given - the type says a review happened; only the state says whether it was good news
      const { user } = await bootstrap.utils.authUtils.setupUser({
        githubId: '4242',
        githubLogin: 'ablaszkiewicz',
      });
      await subscribe(user.id);

      // when
      await send('pull_request_review', {
        action: 'submitted',
        installation: { id: Number(INSTALLATION_ID) },
        repository: REPOSITORY,
        sender: { id: 999, login: 'reviewer' },
        review: { state: 'changes_requested', body: 'This leaks a listener.' },
        pull_request: {
          number: 128,
          title: 'Wire up webhooks',
          html_url: 'https://github.com/ablaszkiewicz/proke/pull/128',
          user: { id: 4242, login: 'ablaszkiewicz' },
        },
      });

      // then
      expect(await firstNotification()).toMatchObject({
        type: NotificationType.ReviewSubmitted,
        number: 128,
        reviewState: 'changes_requested',
        excerpt: 'This leaks a listener.',
      });
    });

    it('lower-cases a verdict GitHub shouts', async () => {
      // given - the REST API returns these upper-cased; webhooks do not, but the renderer
      // matches on an exact string and should not be at the mercy of which one we got
      const { user } = await bootstrap.utils.authUtils.setupUser({
        githubId: '4242',
        githubLogin: 'ablaszkiewicz',
      });
      await subscribe(user.id);

      // when
      await send('pull_request_review', {
        action: 'submitted',
        installation: { id: Number(INSTALLATION_ID) },
        repository: REPOSITORY,
        sender: { id: 999, login: 'reviewer' },
        review: { state: 'APPROVED' },
        pull_request: {
          number: 9,
          title: 'Wire up webhooks',
          html_url: 'https://github.com/ablaszkiewicz/proke/pull/9',
          user: { id: 4242, login: 'ablaszkiewicz' },
        },
      });

      // then
      expect(await firstNotification()).toMatchObject({ reviewState: 'approved' });
    });

    it('says nothing when a bot comments on your pull request', async () => {
      // given
      const { user } = await bootstrap.utils.authUtils.setupUser({
        githubId: '4242',
        githubLogin: 'ablaszkiewicz',
      });
      await subscribe(user.id);

      // when - the coverage report, every push, forever
      await send('issue_comment', {
        ...prCommentPayload({ body: 'Coverage decreased by 0.02%' }),
        sender: { id: 41898282, login: 'github-actions[bot]', type: 'Bot' },
      });

      // then
      await expectNoPoke();
    });

    it('says nothing when a bot writes your handle', async () => {
      // given
      const { user } = await bootstrap.utils.authUtils.setupUser({
        githubId: '4242',
        githubLogin: 'ablaszkiewicz',
      });
      await subscribe(user.id);

      // when - a machine typing @you is not a colleague asking you something
      await send('issue_comment', {
        ...prCommentPayload({
          body: '@ablaszkiewicz this dependency has a new major version',
          authorGithubId: 7000,
        }),
        sender: { id: 49699333, login: 'dependabot[bot]', type: 'Bot' },
      });

      // then
      await expectNoPoke();
    });

    it('suppresses on type alone, without the [bot] suffix', async () => {
      // given - the two markers disagree in some payloads; either is enough
      const { user } = await bootstrap.utils.authUtils.setupUser({
        githubId: '4242',
        githubLogin: 'ablaszkiewicz',
      });
      await subscribe(user.id);

      // when
      await send('issue_comment', {
        ...prCommentPayload({ body: 'automated note' }),
        sender: { id: 1234, login: 'some-integration', type: 'Bot' },
      });

      // then
      await expectNoPoke();
    });

    it('still pokes for a person whose name merely contains bot', async () => {
      // given - matched as a suffix, so `robotnik` is a person
      const { user } = await bootstrap.utils.authUtils.setupUser({
        githubId: '4242',
        githubLogin: 'ablaszkiewicz',
      });
      await subscribe(user.id);

      // when
      await send('issue_comment', {
        ...prCommentPayload({ body: 'take a look @ablaszkiewicz', authorGithubId: 7000 }),
        sender: { id: 8080, login: 'robotnik', type: 'User' },
      });

      // then
      expect(await firstNotification()).toMatchObject({
        type: NotificationType.PullRequestMention,
        actorLogin: 'robotnik',
      });
    });

    it('still tells you when a bot merges your pull request', async () => {
      // given - a merge queue landing your work is not chatter
      const { user } = await bootstrap.utils.authUtils.setupUser({
        githubId: '4242',
        githubLogin: 'ablaszkiewicz',
      });
      await subscribe(user.id);

      // when
      await send('pull_request', {
        action: 'closed',
        installation: { id: Number(INSTALLATION_ID) },
        repository: REPOSITORY,
        sender: { id: 1234, login: 'mergify[bot]', type: 'Bot' },
        pull_request: {
          title: 'Bump the reel blur',
          html_url: 'https://github.com/ablaszkiewicz/proke/pull/4',
          merged: true,
          user: { id: 4242, login: 'ablaszkiewicz' },
        },
      });

      // then
      expect(await firstNotification()).toMatchObject({
        type: NotificationType.PullRequestMerged,
      });
    });

    it('still tells you when a bot asks for your review', async () => {
      // given
      const { user } = await bootstrap.utils.authUtils.setupUser({
        githubId: '4242',
        githubLogin: 'ablaszkiewicz',
      });
      await subscribe(user.id);

      // when - an assignment automation is handing you real work
      await send('pull_request', {
        ...reviewRequestedPayload(4242),
        sender: { id: 1234, login: 'reviewer-lottery[bot]', type: 'Bot' },
      });

      // then - in the author's name, not the bot's: whose work is waiting is the point of the line
      expect(await firstNotification()).toMatchObject({
        type: NotificationType.ReviewRequested,
        actorLogin: 'author',
      });
    });

    it('names the person who asked when a person asked', async () => {
      // given
      const { user } = await bootstrap.utils.authUtils.setupUser({
        githubId: '4242',
        githubLogin: 'ablaszkiewicz',
      });
      await subscribe(user.id);

      // when - a colleague, not the author, pulls you in
      await send('pull_request', {
        ...reviewRequestedPayload(4242),
        sender: { id: 1234, login: 'grace' },
      });

      // then
      expect(await firstNotification()).toMatchObject({ actorLogin: 'grace' });
    });

    it('matches a handle regardless of case', async () => {
      // given
      const { user } = await bootstrap.utils.authUtils.setupUser({
        githubId: '4242',
        githubLogin: 'ablaszkiewicz',
      });
      await subscribe(user.id);

      // when - GitHub renders @ABlaszkiewicz and @ablaszkiewicz as the same person
      await send(
        'issue_comment',
        prCommentPayload({ body: 'thanks @ABlaszkiewicz', authorGithubId: 7000 }),
      );

      // then
      expect(await firstNotification()).toMatchObject({
        type: NotificationType.PullRequestMention,
      });
    });

    it('pokes someone mentioned when an issue is opened', async () => {
      // given
      const { user } = await bootstrap.utils.authUtils.setupUser({
        githubId: '4242',
        githubLogin: 'ablaszkiewicz',
      });
      await subscribe(user.id);

      // when
      await send('issues', {
        action: 'opened',
        installation: { id: Number(INSTALLATION_ID) },
        issue: {
          title: 'Webhook deliveries are slow',
          html_url: 'https://github.com/ablaszkiewicz/proke/issues/4',
          body: '@ablaszkiewicz any idea?',
          user: { id: 999, login: 'reporter' },
        },
        repository: REPOSITORY,
        sender: { id: 999, login: 'reporter' },
      });

      // then
      expect(await firstNotification()).toMatchObject({
        type: NotificationType.IssueMention,
        title: 'Webhook deliveries are slow',
      });
    });

    it('ignores a handle inside a code block', async () => {
      // given
      const { user } = await bootstrap.utils.authUtils.setupUser({
        githubId: '4242',
        githubLogin: 'ablaszkiewicz',
      });
      await subscribe(user.id);

      // when
      await send(
        'issue_comment',
        prCommentPayload({
          body: 'see below\n```\ncurl -u @ablaszkiewicz\n```',
          authorGithubId: 7000,
        }),
      );

      // then - a handle in a snippet is documentation, not a summons
      await expectNoPoke();
    });

    it('ignores an email address that looks like a mention', async () => {
      // given
      const { user } = await bootstrap.utils.authUtils.setupUser({
        githubId: '4242',
        githubLogin: 'example',
      });
      await subscribe(user.id);

      // when
      await send(
        'issue_comment',
        prCommentPayload({ body: 'mail me at bob@example.com', authorGithubId: 7000 }),
      );

      // then
      await expectNoPoke();
    });

    it('does not poke you for mentioning yourself', async () => {
      // given
      const { user } = await bootstrap.utils.authUtils.setupUser({
        githubId: '999',
        githubLogin: 'commenter',
      });
      await subscribe(user.id);

      // when - the sender is the person named
      await send(
        'issue_comment',
        prCommentPayload({ body: 'note to self @commenter', authorGithubId: 7000 }),
      );

      // then
      await expectNoPoke();
    });

    it('collapses a comment on your own pull request that also mentions you', async () => {
      // given - the author and the mentioned person are the same user
      const { user } = await bootstrap.utils.authUtils.setupUser({
        githubId: '4242',
        githubLogin: 'author',
      });
      await subscribe(user.id);

      // when
      await send(
        'issue_comment',
        prCommentPayload({ body: 'hey @author look at this', authorGithubId: 4242 }),
      );

      // then - one poke, and the one describing the closer relationship
      const notification = await firstNotification();
      expect(notification).toMatchObject({ type: NotificationType.PullRequestComment });
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(deliverSpy).toHaveBeenCalledTimes(1);
    });

    it('pokes a mentioned bystander and the author separately', async () => {
      // given
      const author = await bootstrap.utils.authUtils.setupUser({
        githubId: '4242',
        githubLogin: 'author',
      });
      const bystander = await bootstrap.utils.authUtils.setupUser({
        githubId: '7777',
        githubLogin: 'ablaszkiewicz',
      });
      await subscribe(author.user.id);
      await subscribe(bystander.user.id);

      // when
      await send(
        'issue_comment',
        prCommentPayload({ body: 'cc @ablaszkiewicz', authorGithubId: 4242 }),
      );

      // then
      await waitFor(() => deliverSpy.mock.calls.length === 2);
      const types = deliverSpy.mock.calls.map((call) => call[1].type).sort();
      expect(types).toEqual(
        [NotificationType.PullRequestComment, NotificationType.PullRequestMention].sort(),
      );
    });
  });

  describe('team mentions', () => {
    /**
     * An org-owned repository: `organization` is the only thing saying which org the comment
     * happened in. The author is nobody in particular, so the only pokes in play are the team's.
     */
    const teamCommentPayload = (body: string, senderGithubId = 999) => ({
      action: 'created',
      installation: { id: Number(INSTALLATION_ID) },
      organization: { login: ORG },
      issue: {
        title: 'Something is broken',
        pull_request: { html_url: 'https://github.com/acme/proke/pull/3' },
        user: { id: 7000, login: 'author' },
      },
      comment: { html_url: 'https://github.com/acme/proke/pull/3#issuecomment-1', body },
      repository: ORG_REPOSITORY,
      sender: { id: senderGithubId, login: 'commenter' },
    });

    it('pokes everybody in a mentioned team', async () => {
      // given - two of the three members have proke accounts
      await setupMember('4242', 'ada');
      await setupMember('4243', 'rob');
      mockInstallationToken();
      mockTeamMembers('reviewers', [
        { id: 4242, login: 'ada' },
        { id: 4243, login: 'rob' },
        { id: 4244, login: 'nina' },
      ]);

      // when
      await send('issue_comment', teamCommentPayload('ping @acme/reviewers'));

      // then - one poke each, naming the team rather than claiming they were named personally
      await waitFor(() => deliverSpy.mock.calls.length === 2);
      const recipients = deliverSpy.mock.calls.map((call) => call[0].githubLogin).sort();
      expect(recipients).toEqual(['ada', 'rob']);
      expect(deliverSpy.mock.calls[0][1]).toMatchObject({
        type: NotificationType.TeamMention,
        teamHandle: 'acme/reviewers',
        repositoryFullName: 'acme/proke',
      });
    });

    it('does not poke the person who wrote the mention', async () => {
      // given - the commenter is in the team they named
      await setupMember('999', 'commenter');
      await setupMember('4242', 'ada');
      mockInstallationToken();
      mockTeamMembers('reviewers', [
        { id: 999, login: 'commenter' },
        { id: 4242, login: 'ada' },
      ]);

      // when
      await send('issue_comment', teamCommentPayload('ping @acme/reviewers'));

      // then
      await waitFor(() => deliverSpy.mock.calls.length > 0);
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(deliverSpy).toHaveBeenCalledTimes(1);
      expect(deliverSpy.mock.calls[0][0].githubLogin).toEqual('ada');
    });

    it('skips a team with more members than the cap', async () => {
      // given - a full page and an offer of another one is GitHub saying "more than 100"
      await setupMember('4242', 'ada');
      mockInstallationToken();
      mockTeamMembers(
        'everyone',
        Array.from({ length: 100 }, (_, index) => ({ id: 4242 + index, login: `member${index}` })),
        { overCap: true },
      );

      // when
      await send('issue_comment', teamCommentPayload('morning @acme/everyone'));

      // then - a mention that would reach the whole org is not a poke, it is an announcement
      await expectNoPoke();
    });

    it('does not read the org half of a team handle as a person', async () => {
      // given - a user whose handle happens to match the org, and no such team
      await setupMember('4242', 'acme');
      mockInstallationToken();
      nock('https://api.github.com')
        .get(`/orgs/${ORG}/teams/nobody/members`)
        .query(true)
        .reply(404);

      // when
      await send('issue_comment', teamCommentPayload('ping @acme/nobody'));

      // then
      await expectNoPoke();
    });

    it('ignores a team belonging to another organisation', async () => {
      // given - the only token we hold is this org's, so someone else's team is just prose
      await setupMember('4242', 'ada');

      // when
      await send('issue_comment', teamCommentPayload('like @othercorp/reviewers do'));

      // then - and no GitHub call was made to find that out
      await expectNoPoke();
      expect(nock.pendingMocks()).toHaveLength(0);
    });

    it('collapses a comment naming both you and your team into the personal mention', async () => {
      // given
      await setupMember('4242', 'ada');
      mockInstallationToken();
      mockTeamMembers('reviewers', [{ id: 4242, login: 'ada' }]);

      // when
      await send('issue_comment', teamCommentPayload('@ada and @acme/reviewers - thoughts?'));

      // then - one poke, and the one that says somebody asked her rather than her team
      const notification = await firstNotification();
      expect(notification).toMatchObject({ type: NotificationType.PullRequestMention });
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(deliverSpy).toHaveBeenCalledTimes(1);
    });

    it('asks GitHub about a team once and remembers the answer', async () => {
      // given - one interceptor each, so a second lookup would be an unmatched request
      await setupMember('4242', 'ada');
      mockInstallationToken();
      mockTeamMembers('reviewers', [{ id: 4242, login: 'ada' }]);

      // when - two separate events naming the same team
      await send('issue_comment', teamCommentPayload('ping @acme/reviewers'));
      await waitFor(() => deliverSpy.mock.calls.length === 1);
      await send('issue_comment', teamCommentPayload('again @acme/reviewers'));

      // then - both delivered, off one round trip
      await waitFor(() => deliverSpy.mock.calls.length === 2);
      expect(nock.pendingMocks()).toHaveLength(0);
    });

    it('ignores a team mention from a bot', async () => {
      // given
      await setupMember('4242', 'ada');
      const payload = {
        ...teamCommentPayload('ping @acme/reviewers'),
        sender: { id: 555, login: 'dependabot[bot]', type: 'Bot' },
      };

      // when
      await send('issue_comment', payload);

      // then - suppressed before anything is asked of GitHub, so nothing was
      await expectNoPoke();
      expect(nock.pendingMocks()).toHaveLength(0);
    });

    it('does not poke a team member who has not opted into the installation', async () => {
      // given - an account, but no subscription
      await bootstrap.utils.authUtils.setupUser({ githubId: '4242', githubLogin: 'ada' });
      mockInstallationToken();
      mockTeamMembers('reviewers', [{ id: 4242, login: 'ada' }]);

      // when
      await send('issue_comment', teamCommentPayload('ping @acme/reviewers'));

      // then - somebody else's install is not consent, and a team mention is no exception
      await expectNoPoke();
    });

    it('does not poke a team member who has switched team mentions off', async () => {
      // given
      const { user } = await bootstrap.utils.authUtils.setupUser({
        githubId: '4242',
        githubLogin: 'ada',
      });
      await subscribe(user.id, {
        repositoryScope: RepositoryScope.All,
        notificationTypes: [NotificationType.PullRequestMention],
      });
      mockInstallationToken();
      mockTeamMembers('reviewers', [{ id: 4242, login: 'ada' }]);

      // when
      await send('issue_comment', teamCommentPayload('ping @acme/reviewers'));

      // then
      await expectNoPoke();
    });
  });

  /**
   * The other half of `review_requested`. GitHub names a person in `requested_reviewer` and a
   * group in `requested_team`, never both - so a team asked for review arrives as a payload with
   * no reviewer in it at all, and used to route to nobody.
   */
  describe('team review requests', () => {
    const ORG_PULL_REQUEST = {
      title: 'Wire up webhooks',
      html_url: 'https://github.com/acme/proke/pull/9',
      number: 9,
      user: { id: 7000, login: 'author' },
    };

    const teamReviewRequestPayload = (slug: string, senderGithubId = 999) => ({
      action: 'review_requested',
      installation: { id: Number(INSTALLATION_ID) },
      organization: { login: ORG },
      requested_team: { id: 77, name: 'Reviewers', slug },
      pull_request: ORG_PULL_REQUEST,
      repository: ORG_REPOSITORY,
      sender: { id: senderGithubId, login: 'author' },
    });

    /** The same ask, of one person by name - what GitHub sends next when the team assigns. */
    const memberReviewRequestPayload = (member: { id: number; login: string }) => ({
      action: 'review_requested',
      installation: { id: Number(INSTALLATION_ID) },
      organization: { login: ORG },
      requested_reviewer: member,
      pull_request: ORG_PULL_REQUEST,
      repository: ORG_REPOSITORY,
      sender: { id: 999, login: 'author' },
    });

    /**
     * Exactly this many, once every window has closed on its own. A quiet interval afterwards
     * is what turns "at least this many so far" into "this many".
     */
    const allNotifications = async (count: number) => {
      await waitFor(() => deliverSpy.mock.calls.length >= count);
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(deliverSpy).toHaveBeenCalledTimes(count);

      return deliverSpy.mock.calls.map((call) => ({ user: call[0], notification: call[1] }));
    };

    it('pokes everybody in a team asked for review', async () => {
      // given - two of the three members have proke accounts
      await setupMember('4242', 'ada');
      await setupMember('4243', 'rob');
      mockInstallationToken();
      mockTeamMembers('reviewers', [
        { id: 4242, login: 'ada' },
        { id: 4243, login: 'rob' },
        { id: 4244, login: 'nina' },
      ]);

      // when
      await send('pull_request', teamReviewRequestPayload('reviewers'));

      // then - a review request rather than a mention: it is something waiting on them
      await waitFor(() => deliverSpy.mock.calls.length === 2);
      const recipients = deliverSpy.mock.calls.map((call) => call[0].githubLogin).sort();
      expect(recipients).toEqual(['ada', 'rob']);
      expect(deliverSpy.mock.calls[0][1]).toMatchObject({
        type: NotificationType.ReviewRequested,
        teamHandle: 'acme/reviewers',
        title: 'Wire up webhooks',
        htmlUrl: 'https://github.com/acme/proke/pull/9',
        repositoryFullName: 'acme/proke',
        actorLogin: 'author',
      });
    });

    it('still pokes when a bot did the asking', async () => {
      // given - most team assignment is done by a resolver bot, so suppressing it would suppress
      // the feature. Being asked for a review is a request either way, unlike a bot's chatter.
      await setupMember('4242', 'ada');
      mockInstallationToken();
      mockTeamMembers('reviewers', [{ id: 4242, login: 'ada' }]);

      // when
      await send('pull_request', {
        ...teamReviewRequestPayload('reviewers'),
        sender: { id: 555, login: 'pr-assigner[bot]', type: 'Bot' },
      });

      // then - and in the author's name, same as when a bot asks a person
      expect(await firstNotification()).toMatchObject({
        type: NotificationType.ReviewRequested,
        teamHandle: 'acme/reviewers',
        actorLogin: 'author',
      });
    });

    it('does not poke whoever asked for the review', async () => {
      // given - the person assigning the team is in it
      await setupMember('999', 'author');
      await setupMember('4242', 'ada');
      mockInstallationToken();
      mockTeamMembers('reviewers', [
        { id: 999, login: 'author' },
        { id: 4242, login: 'ada' },
      ]);

      // when
      await send('pull_request', teamReviewRequestPayload('reviewers'));

      // then
      await waitFor(() => deliverSpy.mock.calls.length > 0);
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(deliverSpy).toHaveBeenCalledTimes(1);
      expect(deliverSpy.mock.calls[0][0].githubLogin).toEqual('ada');
    });

    it('skips a team with more members than the cap', async () => {
      // given - asking a hundred-plus people is a broadcast, not a review request
      await setupMember('4242', 'ada');
      mockInstallationToken();
      mockTeamMembers(
        'everyone',
        Array.from({ length: 100 }, (_, index) => ({ id: 4242 + index, login: `member${index}` })),
        { overCap: true },
      );

      // when
      await send('pull_request', teamReviewRequestPayload('everyone'));

      // then
      await expectNoPoke();
    });

    it('ignores a request with no organisation to resolve the team against', async () => {
      // given - teams belong to orgs, and without one there is nothing to ask GitHub about
      await setupMember('4242', 'ada');
      const { organization, ...withoutOrganization } = teamReviewRequestPayload('reviewers');

      // when
      await send('pull_request', withoutOrganization);

      // then - and no GitHub call was made to find that out
      await expectNoPoke();
      expect(nock.pendingMocks()).toHaveLength(0);
    });

    it('does not poke a member who has switched review requests off', async () => {
      // given
      const { user } = await bootstrap.utils.authUtils.setupUser({
        githubId: '4242',
        githubLogin: 'ada',
      });
      await subscribe(user.id, {
        repositoryScope: RepositoryScope.All,
        notificationTypes: [NotificationType.PullRequestMention],
      });
      mockInstallationToken();
      mockTeamMembers('reviewers', [{ id: 4242, login: 'ada' }]);

      // when
      await send('pull_request', teamReviewRequestPayload('reviewers'));

      // then
      await expectNoPoke();
    });

    /**
     * A team with review assignment switched on is asked, and then GitHub asks some of its
     * members by name - two webhooks a second apart, to one of which each member is both the
     * group and the person. Sent straight through, that is the same request twice.
     */
    describe('followed by the members being asked by name', () => {
      const ADA = { id: 4242, login: 'ada' };
      const ROB = { id: 4243, login: 'rob' };

      beforeEach(async () => {
        await setupMember('4242', 'ada');
        await setupMember('4243', 'rob');
        mockInstallationToken();
        mockTeamMembers('reviewers', [ADA, ROB]);
      });

      it('tells a member asked both ways once, as the direct ask', async () => {
        // when - the team, then ada by name; rob is only ever reached as part of the team
        await send('pull_request', teamReviewRequestPayload('reviewers'));
        await send('pull_request', memberReviewRequestPayload(ADA));

        // then
        const pokes = await allNotifications(2);
        const ada = pokes.find((poke) => poke.user.githubLogin === 'ada');
        const rob = pokes.find((poke) => poke.user.githubLogin === 'rob');

        expect(ada?.notification).toMatchObject({ type: NotificationType.ReviewRequested });
        expect(ada?.notification.teamHandle).toBeUndefined();
        expect(rob?.notification).toMatchObject({
          type: NotificationType.ReviewRequested,
          teamHandle: 'acme/reviewers',
        });
      });

      it('picks the direct ask whichever of the two lands first', async () => {
        // when - webhooks carry no ordering guarantee, and this is the order seen in the wild
        await send('pull_request', memberReviewRequestPayload(ADA));
        await send('pull_request', teamReviewRequestPayload('reviewers'));

        // then
        const pokes = await allNotifications(2);
        const ada = pokes.find((poke) => poke.user.githubLogin === 'ada');

        expect(ada?.notification.teamHandle).toBeUndefined();
      });

      it('keeps requests about different pull requests apart', async () => {
        // when - rob is asked by name on another pull request entirely
        await send('pull_request', teamReviewRequestPayload('reviewers'));
        await send('pull_request', {
          ...memberReviewRequestPayload(ROB),
          pull_request: {
            ...ORG_PULL_REQUEST,
            number: 10,
            html_url: 'https://github.com/acme/proke/pull/10',
          },
        });

        // then - three pokes: ada for the team, rob for the team, rob for the other one
        const pokes = await allNotifications(3);
        const robs = pokes.filter((poke) => poke.user.githubLogin === 'rob');

        expect(robs.map((poke) => poke.notification.number).sort((a, b) => a - b)).toEqual([9, 10]);
      });
    });

    it('does not ask the author to review their own pull request', async () => {
      // given - the author is in the team, and a bot did the asking, so the author is neither
      // the sender nor somebody GitHub would ever have requested by name
      await setupMember('7000', 'author');
      await setupMember('4242', 'ada');
      mockInstallationToken();
      mockTeamMembers('reviewers', [
        { id: 7000, login: 'author' },
        { id: 4242, login: 'ada' },
      ]);

      // when
      await send('pull_request', {
        ...teamReviewRequestPayload('reviewers'),
        sender: { id: 555, login: 'pr-assigner[bot]', type: 'Bot' },
      });

      // then
      const [poke] = await allNotifications(1);
      expect(poke.user.githubLogin).toEqual('ada');
    });
  });

  /**
   * GitHub delivers one review as several webhooks - one per inline comment, plus one for the
   * submission - in no guaranteed order. Sent straight through, approving a pull request with
   * three notes on it costs the author four Slack messages.
   */
  describe('a review arriving in pieces', () => {
    const REVIEW_ID = 88001;
    const PULL_REQUEST = {
      number: 9,
      title: 'Wire up webhooks',
      html_url: 'https://github.com/ablaszkiewicz/proke/pull/9',
      user: { id: 4242, login: 'author' },
    };

    const reviewPayload = (review: object = {}, reviewId = REVIEW_ID) => ({
      action: 'submitted',
      installation: { id: Number(INSTALLATION_ID) },
      repository: REPOSITORY,
      sender: { id: 999, login: 'reviewer' },
      review: {
        id: reviewId,
        state: 'approved',
        html_url: `https://github.com/ablaszkiewicz/proke/pull/9#pullrequestreview-${reviewId}`,
        ...review,
      },
      pull_request: PULL_REQUEST,
    });

    const commentPayload = (id: number, body: string, reviewId = REVIEW_ID) => ({
      action: 'created',
      installation: { id: Number(INSTALLATION_ID) },
      repository: REPOSITORY,
      sender: { id: 999, login: 'reviewer' },
      comment: {
        id,
        pull_request_review_id: reviewId,
        html_url: `https://github.com/ablaszkiewicz/proke/pull/9#discussion_r${id}`,
        body,
      },
      pull_request: PULL_REQUEST,
    });

    /**
     * Every one of these pokes is about a pull request with a number, so the size of the change
     * gets fetched. Once, thanks to the cache, however many webhooks the review arrived as.
     */
    const mockDiff = () => {
      nock('https://api.github.com')
        .post(`/app/installations/${INSTALLATION_ID}/access_tokens`)
        .reply(201, {
          token: 'ghs_installation',
          expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
        });
      nock('https://api.github.com')
        .get('/repos/ablaszkiewicz/proke/pulls/9')
        .reply(200, { additions: 5, deletions: 1 });
    };

    const setupAuthor = async () => {
      const { user } = await bootstrap.utils.authUtils.setupUser({
        githubId: '4242',
        githubLogin: 'author',
      });
      await subscribe(user.id);
      return user;
    };

    /**
     * One poke and no second one. Any batch that failed to merge would still be sitting in its
     * own window, so closing them all by hand is what makes the count mean something.
     */
    const onlyNotification = async () => {
      await waitFor(() => deliverSpy.mock.calls.length > 0);
      await bootstrap.services.reviewBatchService.flushAll();
      expect(deliverSpy).toHaveBeenCalledTimes(1);

      return deliverSpy.mock.calls[0][1];
    };

    it('folds an approval and its comments into a single poke', async () => {
      // given
      await setupAuthor();
      mockDiff();

      // when - three webhooks for one act
      await send('pull_request_review', reviewPayload());
      await send('pull_request_review_comment', commentPayload(10, 'nit: rename this'));
      await send('pull_request_review_comment', commentPayload(20, 'and this one too'));

      // then - one message, which knows how much it stands for
      expect(await onlyNotification()).toMatchObject({
        type: NotificationType.ReviewSubmitted,
        reviewState: 'approved',
        comments: { count: 2, mentioned: false },
        excerpt: 'nit: rename this',
      });
    });

    it('quotes the review’s own words ahead of the comments', async () => {
      // given - the reviewer talking about the change as a whole outranks a note on one line
      await setupAuthor();
      mockDiff();

      // when
      await send('pull_request_review', reviewPayload({ body: 'Nice, one thing though.' }));
      await send('pull_request_review_comment', commentPayload(10, 'nit: rename this'));

      // then - and the review body is not counted as one of the comments
      expect(await onlyNotification()).toMatchObject({
        excerpt: 'Nice, one thing though.',
        comments: { count: 1 },
      });
    });

    it('quotes the earliest comment rather than the first webhook to land', async () => {
      // given - webhooks for one review race each other; the ids are what preserve the order
      await setupAuthor();
      mockDiff();

      // when - the later comment arrives first
      await send('pull_request_review_comment', commentPayload(20, 'written second'));
      await send('pull_request_review_comment', commentPayload(10, 'written first'));

      // then
      expect(await onlyNotification()).toMatchObject({
        excerpt: 'written first',
        comments: { count: 2 },
      });
    });

    it('lets an empty review step aside for the comments it carried', async () => {
      // given - GitHub opens a review behind every set of inline comments, verdict or not
      await setupAuthor();
      mockDiff();

      // when
      await send('pull_request_review', reviewPayload({ state: 'commented', body: '' }));
      await send('pull_request_review_comment', commentPayload(10, 'this leaks a listener'));
      await send('pull_request_review_comment', commentPayload(20, 'so does this'));

      // then - "reviewed" would be all this said otherwise, and it said two specific things
      const notification = await onlyNotification();
      expect(notification.type).toEqual(NotificationType.PullRequestComment);
      expect(notification.comments).toEqual({ count: 2, mentioned: false });
      expect(notification.excerpt).toEqual('this leaks a listener');
    });

    it('sends what did arrive when the rest never does', async () => {
      // given - a redelivery, a dropped webhook, or a replica that only saw half of it
      await setupAuthor();
      mockDiff();

      // when - the submission never comes
      await send('pull_request_review_comment', commentPayload(10, 'first'));
      await send('pull_request_review_comment', commentPayload(20, 'second'));

      // then
      expect(await onlyNotification()).toMatchObject({ comments: { count: 2 } });
    });

    it('says you were named rather than merely commented on', async () => {
      // given - somebody who is not the author, pulled in by name
      const { user } = await bootstrap.utils.authUtils.setupUser({
        githubId: '5555',
        githubLogin: 'ablaszkiewicz',
      });
      await subscribe(user.id);
      mockDiff();

      // when
      await send('pull_request_review_comment', commentPayload(10, 'cc @ablaszkiewicz'));
      await send('pull_request_review_comment', commentPayload(20, '@ablaszkiewicz here too'));

      // then - being named is why they are being poked and must survive the folding
      expect(await onlyNotification()).toMatchObject({
        type: NotificationType.PullRequestMention,
        comments: { count: 2, mentioned: true },
      });
    });

    it('keeps two separate reviews apart', async () => {
      // given - two people reviewing at once is one pull request and two acts
      await setupAuthor();
      mockDiff();

      // when
      await send('pull_request_review', reviewPayload({}, 88001));
      await send('pull_request_review', reviewPayload({ state: 'changes_requested' }, 99002));

      // then
      await waitFor(() => deliverSpy.mock.calls.length === 2);
      const states = deliverSpy.mock.calls.map((call) => call[1].reviewState).sort();
      expect(states).toEqual(['approved', 'changes_requested']);
    });
  });

  /**
   * The one poke whose recipient is not in the payload. A reply names the comment it answers by
   * id, and who wrote that comment has to come from somewhere else - the webhook for the comment
   * itself, if we saw it, and GitHub if we did not.
   */
  describe('replies to your comment', () => {
    const PULL_REQUEST = {
      number: 9,
      title: 'Wire up webhooks',
      html_url: 'https://github.com/ablaszkiewicz/proke/pull/9',
      user: { id: 4242, login: 'author' },
    };

    /** `inReplyTo` absent is a comment that opens a thread; present is an answer in one. */
    const reviewCommentPayload = ({
      id,
      body = 'a note',
      inReplyTo,
      senderGithubId = 999,
      senderLogin = 'reviewer',
    }: {
      id: number;
      body?: string;
      inReplyTo?: number;
      senderGithubId?: number;
      senderLogin?: string;
    }) => ({
      action: 'created',
      installation: { id: Number(INSTALLATION_ID) },
      repository: REPOSITORY,
      sender: { id: senderGithubId, login: senderLogin },
      comment: {
        id,
        user: { id: senderGithubId, login: senderLogin },
        pull_request_review_id: 88001,
        in_reply_to_id: inReplyTo,
        html_url: `https://github.com/ablaszkiewicz/proke/pull/9#discussion_r${id}`,
        body,
      },
      pull_request: PULL_REQUEST,
    });

    const mockToken = () =>
      nock('https://api.github.com')
        .post(`/app/installations/${INSTALLATION_ID}/access_tokens`)
        .reply(201, {
          token: 'ghs_installation',
          expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
        });

    /** Every poke here is about a numbered pull request, so the size gets fetched regardless. */
    const mockDiff = () => {
      mockToken();
      nock('https://api.github.com')
        .get('/repos/ablaszkiewicz/proke/pulls/9')
        .reply(200, { additions: 5, deletions: 1 });
    };

    /** Whoever wrote a comment, for the times we were never told. */
    const mockCommentAuthor = (commentId: number, githubId: number | null) =>
      nock('https://api.github.com')
        .get(`/repos/ablaszkiewicz/proke/pulls/comments/${commentId}`)
        .reply(githubId === null ? 404 : 200, githubId === null ? {} : { user: { id: githubId } });

    /** A reviewer, who is not the pull request's author - so a poke can only be about the reply. */
    const setupReviewer = async () => {
      const { user } = await bootstrap.utils.authUtils.setupUser({
        githubId: '5555',
        githubLogin: 'ablaszkiewicz',
      });
      await subscribe(user.id);
      return user;
    };

    const onlyNotification = async () => {
      await waitFor(() => deliverSpy.mock.calls.length > 0);
      await bootstrap.services.reviewBatchService.flushAll();
      expect(deliverSpy).toHaveBeenCalledTimes(1);

      return deliverSpy.mock.calls[0][1];
    };

    it('pokes the person whose thread was replied to', async () => {
      // given - the comment being replied to was written by our user, and we watched it happen
      await setupReviewer();
      mockDiff();

      // when
      await send(
        'pull_request_review_comment',
        reviewCommentPayload({ id: 10, senderGithubId: 5555, senderLogin: 'ablaszkiewicz' }),
      );
      await send(
        'pull_request_review_comment',
        reviewCommentPayload({ id: 20, inReplyTo: 10, body: 'pushed a fix, take another look?' }),
      );

      // then - and nothing was asked of GitHub about the author: nock would have refused a call
      // to an endpoint no test mocked, so a poke arriving at all is the write-through working.
      expect(await onlyNotification()).toMatchObject({
        type: NotificationType.CommentReply,
        excerpt: 'pushed a fix, take another look?',
      });
    });

    it('asks GitHub when it never saw the comment being replied to', async () => {
      // given - a thread older than this process, or one a second replica handled
      await setupReviewer();
      mockDiff();
      mockCommentAuthor(10, 5555);

      // when - the reply arrives with no webhook for its parent ahead of it
      await send('pull_request_review_comment', reviewCommentPayload({ id: 20, inReplyTo: 10 }));

      // then
      expect(await onlyNotification()).toMatchObject({ type: NotificationType.CommentReply });
    });

    it('resolves a thread started after an earlier comment was already cached', async () => {
      // given - the regression this cache is keyed per comment to prevent. A cached *list* of a
      // pull request's comments would not hold comment 30, and the reply to it would silently
      // poke nobody - which is exactly the fast back-and-forth the feature exists for.
      await setupReviewer();
      mockDiff();

      // when - an early comment warms the cache, then a brand new thread is opened and answered
      await send('pull_request_review_comment', reviewCommentPayload({ id: 10 }));
      await send(
        'pull_request_review_comment',
        reviewCommentPayload({ id: 30, senderGithubId: 5555, senderLogin: 'ablaszkiewicz' }),
      );
      await send('pull_request_review_comment', reviewCommentPayload({ id: 40, inReplyTo: 30 }));

      // then - the newer thread resolves, with no call to GitHub about its author
      expect(await onlyNotification()).toMatchObject({ type: NotificationType.CommentReply });
    });

    it('drops the reply poke when the parent cannot be resolved', async () => {
      // given - a comment deleted mid-thread. The reply is real; who it answers is now unknowable.
      await setupReviewer();
      mockDiff();
      mockCommentAuthor(10, null);

      // when
      await send('pull_request_review_comment', reviewCommentPayload({ id: 20, inReplyTo: 10 }));

      // then
      await expectNoPoke();
    });

    it('does not poke you for replying in your own thread', async () => {
      // given
      await setupReviewer();
      mockDiff();

      // when - both the thread and the answer are our user's
      await send(
        'pull_request_review_comment',
        reviewCommentPayload({ id: 10, senderGithubId: 5555, senderLogin: 'ablaszkiewicz' }),
      );
      await send(
        'pull_request_review_comment',
        reviewCommentPayload({
          id: 20,
          inReplyTo: 10,
          senderGithubId: 5555,
          senderLogin: 'ablaszkiewicz',
        }),
      );

      // then
      await expectNoPoke();
    });

    it('says replied rather than commented when it is both', async () => {
      // given - the pull request's author, answered in a thread on their own pull request. Two
      // candidates for one person, and the more specific of the two is the one worth sending.
      const { user } = await bootstrap.utils.authUtils.setupUser({
        githubId: '4242',
        githubLogin: 'author',
      });
      await subscribe(user.id);
      mockDiff();

      // when
      await send(
        'pull_request_review_comment',
        reviewCommentPayload({ id: 10, senderGithubId: 4242, senderLogin: 'author' }),
      );
      await send('pull_request_review_comment', reviewCommentPayload({ id: 20, inReplyTo: 10 }));

      // then
      expect(await onlyNotification()).toMatchObject({ type: NotificationType.CommentReply });
    });

    it('ignores a bot replying in your thread', async () => {
      // given
      await setupReviewer();

      // when
      await send(
        'pull_request_review_comment',
        reviewCommentPayload({ id: 10, senderGithubId: 5555, senderLogin: 'ablaszkiewicz' }),
      );
      await send(
        'pull_request_review_comment',
        reviewCommentPayload({
          id: 20,
          inReplyTo: 10,
          senderGithubId: 111,
          senderLogin: 'coverage-bot[bot]',
        }),
      );

      // then - and no diff was mocked, because a suppressed poke must not have cost a call
      await expectNoPoke();
    });

    it('honours the preference being switched off', async () => {
      // given
      const { user } = await bootstrap.utils.authUtils.setupUser({
        githubId: '5555',
        githubLogin: 'ablaszkiewicz',
      });
      await subscribe(user.id, {
        notificationTypes: [NotificationType.ReviewRequested],
      });

      // when
      await send(
        'pull_request_review_comment',
        reviewCommentPayload({ id: 10, senderGithubId: 5555, senderLogin: 'ablaszkiewicz' }),
      );
      await send('pull_request_review_comment', reviewCommentPayload({ id: 20, inReplyTo: 10 }));

      // then
      await expectNoPoke();
    });
  });

  /**
   * What a poke carries besides the sentence: whose repository it is, and how big the change is.
   * Neither is in every payload, and the size of a pull request is the one thing here worth a
   * GitHub call of its own.
   */
  describe('the shape of a poke', () => {
    const AVATAR = 'https://avatars.githubusercontent.com/u/8000?v=4';
    const OWNED_REPOSITORY = {
      ...REPOSITORY,
      owner: { login: 'ablaszkiewicz', avatar_url: AVATAR },
    };

    const pullRequestPayload = (pullRequest: object = {}) => ({
      action: 'review_requested',
      installation: { id: Number(INSTALLATION_ID) },
      requested_reviewer: { id: 4242, login: 'reviewer' },
      pull_request: {
        title: 'Wire up webhooks',
        html_url: 'https://github.com/ablaszkiewicz/proke/pull/9',
        number: 9,
        user: { id: 999, login: 'author' },
        ...pullRequest,
      },
      repository: OWNED_REPOSITORY,
      sender: { id: 999, login: 'author' },
    });

    /** A comment, which arrives with the cut-down pull request object that has no line counts. */
    const commentPayload = (issue: object = {}, comment: object = {}) => ({
      action: 'created',
      installation: { id: Number(INSTALLATION_ID) },
      issue: {
        title: 'Something is broken',
        number: 3,
        pull_request: { html_url: 'https://github.com/ablaszkiewicz/proke/pull/3' },
        user: { id: 4242, login: 'author' },
        ...issue,
      },
      comment: {
        html_url: 'https://github.com/ablaszkiewicz/proke/pull/3#issuecomment-1',
        ...comment,
      },
      repository: OWNED_REPOSITORY,
      sender: { id: 999, login: 'commenter' },
    });

    const mockInstallationToken = () =>
      nock('https://api.github.com')
        .post(`/app/installations/${INSTALLATION_ID}/access_tokens`)
        .reply(201, {
          token: 'ghs_installation',
          expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
        });

    const setupRecipient = async () => {
      const { user } = await bootstrap.utils.authUtils.setupUser({
        githubId: '4242',
        githubLogin: 'reviewer',
      });
      await subscribe(user.id);
      return user;
    };

    it('carries the avatar of whoever owns the repository', async () => {
      // given
      await setupRecipient();

      // when
      await send('pull_request', pullRequestPayload({ additions: 163, deletions: 23 }));

      // then
      expect(await firstNotification()).toMatchObject({ ownerAvatarUrl: AVATAR });
    });

    it('takes the size of the change straight off a pull request event', async () => {
      // given - the one event carrying the full pull request object, so nothing is mocked here
      await setupRecipient();

      // when
      await send('pull_request', pullRequestPayload({ additions: 163, deletions: 23 }));

      // then
      expect(await firstNotification()).toMatchObject({
        diff: { additions: 163, deletions: 23 },
      });
    });

    it('asks GitHub for the size when the event did not carry it', async () => {
      // given - or the same pull request would look different depending on which event poked you
      await setupRecipient();
      mockInstallationToken();
      const pull = nock('https://api.github.com')
        .get('/repos/ablaszkiewicz/proke/pulls/3')
        .reply(200, { additions: 12, deletions: 400 });

      // when
      await send('issue_comment', commentPayload());

      // then
      expect(await firstNotification()).toMatchObject({ diff: { additions: 12, deletions: 400 } });
      expect(pull.isDone()).toEqual(true);
    });

    it('pokes without the size rather than not at all', async () => {
      // given - a pull request GitHub will not tell us about
      await setupRecipient();
      mockInstallationToken();
      nock('https://api.github.com').get('/repos/ablaszkiewicz/proke/pulls/3').reply(404, {});

      // when
      await send('issue_comment', commentPayload());

      // then - the poke is the point; the size is decoration on it
      const notification = await firstNotification();
      expect(notification.type).toEqual(NotificationType.PullRequestComment);
      expect(notification.diff).toBeUndefined();
    });

    it('does not go asking about an issue, which has no diff to ask for', async () => {
      // given - the same event minus the field that makes it a pull request
      await setupRecipient();
      const token = mockInstallationToken();

      // when - a mention, because a comment on an issue is not a poke on its own
      await send(
        'issue_comment',
        commentPayload({ pull_request: undefined }, { body: 'cc @reviewer' }),
      );

      // then - nothing consumed the token, so nothing went near GitHub
      expect(await firstNotification()).toMatchObject({ type: NotificationType.IssueMention });
      expect(token.isDone()).toEqual(false);
    });
  });

  /**
   * Opting into an installation is not the same as being able to see what it covers.
   *
   * An org-wide install reaches repositories a given member cannot open, and an @mention is
   * prose - anybody can type anybody's handle into an issue in a private repository. Without a
   * check here the poke relays the repository name, the title and a quote of the comment to
   * somebody GitHub itself would never have notified.
   */
  describe('repository access', () => {
    const PRIVATE_REPOSITORY = { id: 900, full_name: 'acme/secret', private: true };

    const privateCommentPayload = (body: string) => ({
      action: 'created',
      installation: { id: Number(INSTALLATION_ID) },
      organization: { login: 'acme' },
      issue: {
        title: 'Rotate the signing key',
        pull_request: { html_url: 'https://github.com/acme/secret/pull/3' },
        user: { id: 7000, login: 'author' },
      },
      comment: { html_url: 'https://github.com/acme/secret/pull/3#issuecomment-1', body },
      repository: PRIVATE_REPOSITORY,
      sender: { id: 999, login: 'commenter' },
    });

    /** 200 is "you can see it"; GitHub answers 404 rather than 403 for one you cannot. */
    const mockRepositoryAccess = (granted: boolean, times = 1) =>
      nock('https://api.github.com')
        .get('/repos/acme/secret')
        .times(times)
        .reply(granted ? 200 : 404, {});

    const setupMember = async (githubLogin: string, githubId = '4242', overrides: object = {}) => {
      const { user } = await bootstrap.utils.authUtils.setupUser({
        githubId,
        githubLogin,
        githubAccessToken: 'gho_token',
        ...overrides,
      });
      await subscribe(user.id);
      return user;
    };

    it('does not poke somebody mentioned in a repository they cannot see', async () => {
      // given - a member of the org, opted in, with no access to this particular repository
      await setupMember('ablaszkiewicz');
      const access = mockRepositoryAccess(false);

      // when - anybody in the org can type this handle
      await send('issue_comment', privateCommentPayload('cc @ablaszkiewicz'));

      // then - the repository name, the title and the comment all stay where they belong
      await expectNoPoke();
      expect(access.isDone()).toBe(true);
    });

    it('pokes them once they can see it', async () => {
      // given
      await setupMember('ablaszkiewicz');
      mockRepositoryAccess(true);

      // when
      await send('issue_comment', privateCommentPayload('cc @ablaszkiewicz'));

      // then
      expect(await firstNotification()).toMatchObject({
        type: NotificationType.PullRequestMention,
        repositoryFullName: 'acme/secret',
      });
    });

    it('gates a poke routed by id, not only a mention', async () => {
      // given - the author of the pull request, who has since lost access to the repository
      await setupMember('author', '7000');
      mockRepositoryAccess(false);

      // when - a comment on their own pull request, routed by the id in the payload
      await send('issue_comment', privateCommentPayload('any progress on this?'));

      // then
      await expectNoPoke();
    });

    it('asks nothing about a public repository', async () => {
      // given - a user with no GitHub token at all, who would fail the check if it ran
      const { user } = await bootstrap.utils.authUtils.setupUser({
        githubId: '4242',
        githubLogin: 'ablaszkiewicz',
      });
      await subscribe(user.id);
      // An interceptor that has to go untouched: reaching GitHub here would be the bug.
      const access = nock('https://api.github.com')
        .get('/repos/ablaszkiewicz/proke')
        .reply(200, {});

      // when
      await send(
        'issue_comment',
        prCommentPayload({ body: 'cc @ablaszkiewicz', authorGithubId: 7000 }),
      );

      // then - there is nothing to leak, and it is the common case; it must not cost a call
      expect(await firstNotification()).toMatchObject({
        type: NotificationType.PullRequestMention,
      });
      expect(access.isDone()).toBe(false);
    });

    it('drops the poke when there is no token to vouch for the user', async () => {
      // given - signed in before proke asked for GitHub authorization, or revoked it since
      await setupMember('ablaszkiewicz', '4242', { githubAccessToken: undefined });

      // when
      await send('issue_comment', privateCommentPayload('cc @ablaszkiewicz'));

      // then - failing open here is the leak this check exists to close
      await expectNoPoke();
    });

    it('drops the poke when GitHub cannot be asked at all', async () => {
      // given
      await setupMember('ablaszkiewicz');
      nock('https://api.github.com').get('/repos/acme/secret').reply(500);

      // when
      await send('issue_comment', privateCommentPayload('cc @ablaszkiewicz'));

      // then - a rate limit or an outage is not evidence that somebody may read a private repo
      await expectNoPoke();
    });

    it('does not re-ask GitHub for every comment on the same thread', async () => {
      // given - one interceptor, so a second call would go unmatched
      await setupMember('ablaszkiewicz');
      const access = mockRepositoryAccess(true);

      // when
      await send('issue_comment', privateCommentPayload('cc @ablaszkiewicz'));
      await waitFor(() => deliverSpy.mock.calls.length === 1);
      await send('issue_comment', privateCommentPayload('@ablaszkiewicz again'));

      // then
      await waitFor(() => deliverSpy.mock.calls.length === 2);
      expect(access.isDone()).toBe(true);
    });

    it('pokes only the members of a mentioned team who can see the repository', async () => {
      // given - a team whose members do not all have access to where it was named
      const ada = await setupMember('ada', '4242');
      await setupMember('rob', '4243');

      nock('https://api.github.com')
        .post(`/app/installations/${INSTALLATION_ID}/access_tokens`)
        .reply(201, {
          token: 'ghs_installation',
          expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
        });
      nock('https://api.github.com')
        .get('/orgs/acme/teams/reviewers/members')
        .query({ per_page: '100' })
        .reply(200, [
          { id: 4242, login: 'ada' },
          { id: 4243, login: 'rob' },
        ]);

      // Team membership is not repository access - GitHub answers per person, and so do we.
      nock('https://api.github.com')
        .get('/repos/acme/secret')
        .times(2)
        .reply(function () {
          return this.req.headers.authorization === 'Bearer gho_ada' ? [200, {}] : [404, {}];
        });

      await bootstrap.services.userWriteService.update({
        id: ada.id,
        githubAccessToken: 'gho_ada',
      });

      // when
      await send('issue_comment', privateCommentPayload('ping @acme/reviewers'));

      // then
      await waitFor(() => deliverSpy.mock.calls.length > 0);
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(deliverSpy.mock.calls.map((call) => call[0].id)).toEqual([ada.id]);
    });
  });

  describe('notification preferences', () => {
    it('pokes a subscription written before preferences existed', async () => {
      // given - no scope, no type list, no repository overrides
      const { user } = await bootstrap.utils.authUtils.setupUser({
        githubId: '4242',
        githubLogin: 'reviewer',
      });
      await bootstrap.models.subscriptionModel.collection.insertOne({
        userId: user.id,
        installationId: INSTALLATION_ID,
      });

      // when
      await send('pull_request', reviewRequestedPayload(4242));

      // then - silence would mean an existing user quietly stopped being notified
      expect(await firstNotification()).toMatchObject({
        type: NotificationType.ReviewRequested,
      });
    });

    it('respects a type the user switched off', async () => {
      // given
      const { user } = await bootstrap.utils.authUtils.setupUser({
        githubId: '4242',
        githubLogin: 'reviewer',
      });
      await subscribe(user.id, {
        repositoryScope: RepositoryScope.All,
        notificationTypes: [NotificationType.PullRequestMerged],
      });

      // when
      await send('pull_request', reviewRequestedPayload(4242));

      // then
      await expectNoPoke();
    });

    it('still pokes about a type the user kept', async () => {
      // given
      const { user } = await bootstrap.utils.authUtils.setupUser({
        githubId: '4242',
        githubLogin: 'reviewer',
      });
      await subscribe(user.id, {
        repositoryScope: RepositoryScope.All,
        notificationTypes: [NotificationType.ReviewRequested],
      });

      // when
      await send('pull_request', reviewRequestedPayload(4242));

      // then
      expect(await firstNotification()).toMatchObject({
        type: NotificationType.ReviewRequested,
      });
    });

    it('honours an empty type list as "nothing", not "everything"', async () => {
      // given - the difference between a stored [] and a missing field
      const { user } = await bootstrap.utils.authUtils.setupUser({
        githubId: '4242',
        githubLogin: 'reviewer',
      });
      await subscribe(user.id, { repositoryScope: RepositoryScope.All, notificationTypes: [] });

      // when
      await send('pull_request', reviewRequestedPayload(4242));

      // then
      await expectNoPoke();
    });

    it('stays quiet about a muted repository', async () => {
      // given - subscribed to the whole org except this one repo
      const { user } = await bootstrap.utils.authUtils.setupUser({
        githubId: '4242',
        githubLogin: 'reviewer',
      });
      await subscribe(user.id, {
        repositoryScope: RepositoryScope.All,
        repositories: [{ repositoryId: String(REPOSITORY.id), enabled: false }],
      });

      // when
      await send('pull_request', reviewRequestedPayload(4242));

      // then
      await expectNoPoke();
    });

    it('keeps poking about repositories that were not muted', async () => {
      // given
      const { user } = await bootstrap.utils.authUtils.setupUser({
        githubId: '4242',
        githubLogin: 'reviewer',
      });
      await subscribe(user.id, {
        repositoryScope: RepositoryScope.All,
        repositories: [{ repositoryId: String(OTHER_REPOSITORY.id), enabled: false }],
      });

      // when
      await send('pull_request', reviewRequestedPayload(4242));

      // then
      expect(await firstNotification()).toMatchObject({
        type: NotificationType.ReviewRequested,
      });
    });

    it('under selected scope, pokes only about picked repositories', async () => {
      // given
      const { user } = await bootstrap.utils.authUtils.setupUser({
        githubId: '4242',
        githubLogin: 'reviewer',
      });
      await subscribe(user.id, {
        repositoryScope: RepositoryScope.Selected,
        repositories: [{ repositoryId: String(OTHER_REPOSITORY.id), enabled: true }],
      });

      // when - the event is about a repository that was not picked
      await send('pull_request', reviewRequestedPayload(4242));

      // then
      await expectNoPoke();
    });

    it('under selected scope, pokes about a picked repository', async () => {
      // given
      const { user } = await bootstrap.utils.authUtils.setupUser({
        githubId: '4242',
        githubLogin: 'reviewer',
      });
      await subscribe(user.id, {
        repositoryScope: RepositoryScope.Selected,
        repositories: [{ repositoryId: String(REPOSITORY.id), enabled: true }],
      });

      // when
      await send('pull_request', reviewRequestedPayload(4242));

      // then
      expect(await firstNotification()).toMatchObject({
        type: NotificationType.ReviewRequested,
      });
    });

    it('lets a repository override narrow the types', async () => {
      // given - everything on org-wide, merges only in this one repo
      const { user } = await bootstrap.utils.authUtils.setupUser({
        githubId: '4242',
        githubLogin: 'reviewer',
      });
      await subscribe(user.id, {
        repositoryScope: RepositoryScope.All,
        repositories: [
          {
            repositoryId: String(REPOSITORY.id),
            enabled: true,
            notificationTypes: [NotificationType.PullRequestMerged],
          },
        ],
      });

      // when
      await send('pull_request', reviewRequestedPayload(4242));

      // then
      await expectNoPoke();
    });

    it('falls back to the installation types when an override has no list', async () => {
      // given - enabled, but nothing said about which types
      const { user } = await bootstrap.utils.authUtils.setupUser({
        githubId: '4242',
        githubLogin: 'reviewer',
      });
      await subscribe(user.id, {
        repositoryScope: RepositoryScope.All,
        notificationTypes: [NotificationType.ReviewRequested],
        repositories: [{ repositoryId: String(REPOSITORY.id), enabled: true }],
      });

      // when
      await send('pull_request', reviewRequestedPayload(4242));

      // then - inherit, rather than reading an absent list as "none"
      expect(await firstNotification()).toMatchObject({
        type: NotificationType.ReviewRequested,
      });
    });

    it('delivers a lower-priority poke when the higher one is switched off', async () => {
      // given - the same event is both a comment on their PR and a mention of them; only
      // mentions are on
      const { user } = await bootstrap.utils.authUtils.setupUser({
        githubId: '4242',
        githubLogin: 'author',
      });
      await subscribe(user.id, {
        repositoryScope: RepositoryScope.All,
        notificationTypes: [NotificationType.PullRequestMention],
      });

      // when
      await send('issue_comment', prCommentPayload({ body: 'hey @author', authorGithubId: 4242 }));

      // then - filtering has to happen before collapsing, or the muted type eats the poke
      expect(await firstNotification()).toMatchObject({
        type: NotificationType.PullRequestMention,
      });
    });
  });

  describe('installation lifecycle', () => {
    const installationPayload = (action: string, extra: object = {}) => ({
      action,
      installation: {
        id: 5150,
        account: { id: 77, login: 'acme-corp', type: 'Organization' },
        repository_selection: 'all',
        ...extra,
      },
      sender: { id: 999, login: 'admin' },
    });

    it('stores an installation when the app is installed', async () => {
      // when
      await send('installation', installationPayload('created'));

      // then
      await waitForDocument(async () =>
        Boolean(await bootstrap.models.installationModel.findOne({ installationId: '5150' })),
      );

      const stored = await bootstrap.models.installationModel.findOne({ installationId: '5150' });
      expect(stored).toMatchObject({
        installationId: '5150',
        accountLogin: 'acme-corp',
        accountType: 'Organization',
        repositorySelection: 'all',
      });
    });

    it('removes the installation when the app is uninstalled', async () => {
      // given
      await send('installation', installationPayload('created'));
      await waitForDocument(async () =>
        Boolean(await bootstrap.models.installationModel.findOne({ installationId: '5150' })),
      );

      // when
      await send('installation', installationPayload('deleted'));

      // then
      await waitForDocument(
        async () => !(await bootstrap.models.installationModel.findOne({ installationId: '5150' })),
      );
      expect(await bootstrap.models.installationModel.countDocuments()).toEqual(0);
    });

    it('marks the installation suspended rather than deleting it', async () => {
      // given
      await send('installation', installationPayload('created'));
      await waitForDocument(async () =>
        Boolean(await bootstrap.models.installationModel.findOne({ installationId: '5150' })),
      );

      // when
      await send(
        'installation',
        installationPayload('suspend', { suspended_at: '2026-08-14T12:00:00Z' }),
      );

      // then - a suspended install is still an install; the UI needs to say so
      await waitForDocument(async () => {
        const doc = await bootstrap.models.installationModel.findOne({ installationId: '5150' });
        return Boolean(doc?.suspendedAt);
      });
      const stored = await bootstrap.models.installationModel.findOne({ installationId: '5150' });
      expect(stored?.suspendedAt).toBeDefined();
    });

    it('clears opt-ins when the app is uninstalled', async () => {
      // given
      await send('installation', installationPayload('created'));
      const { user } = await bootstrap.utils.authUtils.setupUser({ githubId: '4242' });
      await subscribe(user.id);

      // when
      await send('installation', installationPayload('deleted'));

      // then - a reinstall must not resurrect consent nobody re-gave
      await waitForDocument(
        async () => (await bootstrap.models.subscriptionModel.countDocuments()) === 0,
      );
      expect(await bootstrap.models.subscriptionModel.countDocuments()).toEqual(0);
    });

    it('survives a redelivered installation event', async () => {
      // when - GitHub redelivers the same event
      await send('installation', installationPayload('created'));
      await send('installation', installationPayload('created'));

      // then
      await waitForDocument(
        async () => (await bootstrap.models.installationModel.countDocuments()) === 1,
      );
      expect(await bootstrap.models.installationModel.countDocuments()).toEqual(1);
    });
  });

  async function waitForDocument(condition: () => Promise<boolean>): Promise<void> {
    const deadline = Date.now() + 2000;

    while (Date.now() < deadline) {
      if (await condition()) {
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    throw new Error('Timed out waiting for document');
  }
});

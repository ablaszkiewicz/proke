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
  const REPOSITORY = { id: 314, full_name: 'ablaszkiewicz/proke' };
  const OTHER_REPOSITORY = { id: 271, full_name: 'ablaszkiewicz/other' };

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

  /** Nothing delivered is proven by a quiet interval - there is no event to wait for. */
  const expectNoPoke = async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
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

      // then
      expect(await firstNotification()).toMatchObject({
        type: NotificationType.ReviewRequested,
      });
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
    const ORG = 'acme';
    const ORG_REPOSITORY = { id: 314, full_name: 'acme/proke' };

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

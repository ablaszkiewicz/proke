import { createHmac } from 'crypto';
import * as nock from 'nock';
import * as request from 'supertest';
import { NotificationType } from '../../src/notifications/core/entities/notification-type.enum';
import { createTestApp } from '../utils/bootstrap';
import { waitFor } from '../utils/wait-for';

const TEAM_ID = 'T0ACME';
const SIGNING_SECRET = 'slack-signing-secret';
const WEBHOOK_SECRET = 'test-webhook-secret';

describe('Slack delivery', () => {
  let bootstrap: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    process.env.SLACK_SIGNING_SECRET = SIGNING_SECRET;
    process.env.TOKEN_ENCRYPTION_KEY = 'test-encryption-key';
    process.env.GH_APP_WEBHOOK_SECRET = WEBHOOK_SECRET;

    bootstrap = await createTestApp();
  });

  beforeEach(async () => {
    await bootstrap.methods.beforeEach();
  });

  afterAll(async () => {
    await bootstrap.methods.afterAll();
  });

  const server = () => bootstrap.app.getHttpServer();
  const delivery = () => bootstrap.services.slackNotificationDeliveryService;

  const notification = (overrides: object = {}) => ({
    type: NotificationType.ReviewRequested,
    title: 'Make the reel blur honest',
    repositoryFullName: 'ablaszkiewicz/proke',
    htmlUrl: 'https://github.com/ablaszkiewicz/proke/pull/42',
    actorLogin: 'ada',
    number: 42,
    ...overrides,
  });

  /** The one line the message leads with, links included. */
  const lead = (posts: any[]) => posts[0].blocks[0].text.text;

  /** A user who is connected end to end: workspace installed, identity linked. */
  const setupConnected = async (options: { dmChannelId?: string } = {}) => {
    const { user, token } = await bootstrap.utils.authUtils.setupUser({
      githubLogin: 'ablaszkiewicz',
    });

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
      dmChannelId: options.dmChannelId,
    });

    return { user, token };
  };

  const mockOpen = (channelId = 'D0ADA') =>
    nock('https://slack.com')
      .post('/api/conversations.open')
      .reply(200, { ok: true, channel: { id: channelId } });

  const capturePost = () => {
    const posts: any[] = [];

    nock('https://slack.com')
      .post('/api/chat.postMessage', (body) => {
        posts.push(body);
        return true;
      })
      .times(5)
      .reply(200, { ok: true });

    return posts;
  };

  describe('the happy path', () => {
    it('opens a DM, posts, and remembers the channel', async () => {
      // given
      const { user } = await setupConnected();
      mockOpen();
      const posts = capturePost();

      // when
      const outcome = await delivery().deliver(user, notification());

      // then
      expect(outcome).toEqual('sent');
      expect(posts[0].channel).toEqual('D0ADA');
      // The push banner shows this line and nothing else, so it carries the whole poke.
      expect(posts[0].text).toEqual(
        '👀 @ada requested your review on Make the reel blur honest #42 · ablaszkiewicz/proke',
      );
      expect(posts[0].unfurl_links).toEqual(false);

      const link = await bootstrap.models.slackLinkModel.findOne({ userId: user.id });
      expect(link?.dmChannelId).toEqual('D0ADA');
    });

    it('reuses the cached channel instead of opening one every time', async () => {
      // given - no conversations.open is mocked, so calling it would fail the delivery
      const { user } = await setupConnected({ dmChannelId: 'D0CACHED' });
      const posts = capturePost();

      // when
      const outcome = await delivery().deliver(user, notification());

      // then
      expect(outcome).toEqual('sent');
      expect(posts[0].channel).toEqual('D0CACHED');
    });

    it('says who did what to which thing, on one line', async () => {
      // given
      const { user } = await setupConnected({ dmChannelId: 'D0CACHED' });
      const posts = capturePost();

      // when
      await delivery().deliver(user, notification({ type: NotificationType.PullRequestComment }));

      // then - the link finishes the sentence, and carries the number people quote at you.
      // The actor is a link too, to the GitHub profile: left bare, Slack matches @-tokens
      // against workspace usernames and lights up the wrong person's long-dead handle.
      expect(lead(posts)).toEqual(
        '💬 <https://github.com/ada|@ada> commented on ' +
          '*<https://github.com/ablaszkiewicz/proke/pull/42|Make the reel blur honest #42>*',
      );
      // The banner renders no markup, so there the handle stays bare.
      expect(posts[0].text).toContain('💬 @ada commented on');
    });

    it('marks an approval and a request for changes differently', async () => {
      // given - the one poke whose news can be good or bad
      const { user } = await setupConnected({ dmChannelId: 'D0CACHED' });
      const posts = capturePost();

      // when
      await delivery().deliver(
        user,
        notification({ type: NotificationType.ReviewSubmitted, reviewState: 'approved' }),
      );
      await delivery().deliver(
        user,
        notification({
          type: NotificationType.ReviewSubmitted,
          reviewState: 'changes_requested',
        }),
      );

      // then
      expect(lead(posts)).toContain('✅ <https://github.com/ada|@ada> approved *<');
      expect(posts[1].blocks[0].text.text).toContain(
        '❌ <https://github.com/ada|@ada> requested changes on *<',
      );
      expect(posts[0].text).toContain('✅');
    });

    it('falls back to plain wording for a review that is neither', async () => {
      // given - a review submitted as comments only approves nothing and blocks nothing
      const { user } = await setupConnected({ dmChannelId: 'D0CACHED' });
      const posts = capturePost();

      // when
      await delivery().deliver(
        user,
        notification({ type: NotificationType.ReviewSubmitted, reviewState: 'commented' }),
      );

      // then - no marker, because there is no verdict to mark
      expect(lead(posts)).toContain('<https://github.com/ada|@ada> reviewed *<');
      expect(lead(posts)).not.toContain('✅');
      expect(lead(posts)).not.toContain('❌');
    });

    it('words an issue mention exactly like a pull request one', async () => {
      // given - being mentioned is being mentioned; the link says which it was
      const { user } = await setupConnected({ dmChannelId: 'D0CACHED' });
      const posts = capturePost();

      // when
      await delivery().deliver(user, notification({ type: NotificationType.IssueMention }));
      await delivery().deliver(user, notification({ type: NotificationType.PullRequestMention }));

      // then
      expect(lead(posts)).toContain('<https://github.com/ada|@ada> mentioned you on *<');
      expect(posts[1].blocks[0].text.text).toContain(
        '<https://github.com/ada|@ada> mentioned you on *<',
      );
    });

    it('names the team rather than claiming the person was named', async () => {
      // given
      const { user } = await setupConnected({ dmChannelId: 'D0CACHED' });
      const posts = capturePost();

      // when
      await delivery().deliver(
        user,
        notification({ type: NotificationType.TeamMention, teamHandle: 'acme/reviewers' }),
      );

      // then
      expect(lead(posts)).toContain(
        '<https://github.com/ada|@ada> mentioned @acme/reviewers on *<',
      );
    });

    it('names the team rather than claiming the review was asked of you personally', async () => {
      // given
      const { user } = await setupConnected({ dmChannelId: 'D0CACHED' });
      const posts = capturePost();

      // when
      await delivery().deliver(
        user,
        notification({
          type: NotificationType.ReviewRequested,
          teamHandle: 'acme/reviewers',
        }),
      );

      // then
      expect(lead(posts)).toContain(
        "<https://github.com/ada|@ada> requested @acme/reviewers's review on *<",
      );
    });

    it('drops the number when the payload had none', async () => {
      // given
      const { user } = await setupConnected({ dmChannelId: 'D0CACHED' });
      const posts = capturePost();

      // when
      await delivery().deliver(user, notification({ number: undefined }));

      // then - no stray "#undefined"
      expect(lead(posts)).toContain('|Make the reel blur honest>');
      expect(lead(posts)).not.toContain('#');
    });

    it('quotes what the person actually wrote', async () => {
      // given
      const { user } = await setupConnected({ dmChannelId: 'D0CACHED' });
      const posts = capturePost();

      // when
      await delivery().deliver(
        user,
        notification({
          type: NotificationType.PullRequestMention,
          excerpt: 'Hey this is the text\nof the comment where you were mentioned',
        }),
      );

      // then - every line prefixed, so Slack draws one bar down the whole quote
      expect(posts[0].blocks[1].text.text).toEqual(
        '> Hey this is the text\n> of the comment where you were mentioned',
      );
      // The repo line stays last; the quote goes between it and the headline.
      expect(posts[0].blocks[2].type).toEqual('context');
    });

    it('keeps the bar unbroken across a paragraph break', async () => {
      // given - a bare empty line would end the quote and start a second one
      const { user } = await setupConnected({ dmChannelId: 'D0CACHED' });
      const posts = capturePost();

      // when
      await delivery().deliver(user, notification({ excerpt: 'First para.\n\nSecond para.' }));

      // then
      expect(posts[0].blocks[1].text.text).toEqual('> First para.\n>\n> Second para.');
    });

    it('cuts a long comment on a word boundary', async () => {
      // given - the message links to the whole thing; it does not have to carry it
      const { user } = await setupConnected({ dmChannelId: 'D0CACHED' });
      const posts = capturePost();

      // when
      await delivery().deliver(user, notification({ excerpt: 'word '.repeat(200).trim() }));

      // then
      const quoted = posts[0].blocks[1].text.text;
      expect(quoted.length).toBeLessThan(340);
      expect(quoted.endsWith('…')).toEqual(true);
      expect(quoted).not.toMatch(/wor…$/);
    });

    it('leaves out the quote when nothing was written', async () => {
      // given - a review request is an event, not a message
      const { user } = await setupConnected({ dmChannelId: 'D0CACHED' });
      const posts = capturePost();

      // when
      await delivery().deliver(user, notification({ type: NotificationType.ReviewRequested }));

      // then - straight from the headline to the repo, no empty quote block
      expect(posts[0].blocks).toHaveLength(2);
      expect(posts[0].blocks[1].type).toEqual('context');
    });

    it('says the verdict and what came with it in one sentence', async () => {
      // given - an approval with notes on it is one act, and reads as one
      const { user } = await setupConnected({ dmChannelId: 'D0CACHED' });
      const posts = capturePost();

      // when
      await delivery().deliver(
        user,
        notification({
          type: NotificationType.ReviewSubmitted,
          reviewState: 'approved',
          comments: { count: 3, mentioned: false },
        }),
      );

      // then
      expect(lead(posts)).toContain(
        '✅ <https://github.com/ada|@ada> approved and left 3 comments on *<',
      );
    });

    it('counts a single comment as one', async () => {
      // given
      const { user } = await setupConnected({ dmChannelId: 'D0CACHED' });
      const posts = capturePost();

      // when
      await delivery().deliver(
        user,
        notification({
          type: NotificationType.ReviewSubmitted,
          reviewState: 'approved',
          comments: { count: 1, mentioned: false },
        }),
      );

      // then
      expect(lead(posts)).toContain(
        '✅ <https://github.com/ada|@ada> approved and left a comment on *<',
      );
    });

    it('stays grammatical when a verdict gains a second clause', async () => {
      // given - "requested changes on" already carries its preposition, and only the last
      // clause may keep one
      const { user } = await setupConnected({ dmChannelId: 'D0CACHED' });
      const posts = capturePost();

      // when
      await delivery().deliver(
        user,
        notification({
          type: NotificationType.ReviewSubmitted,
          reviewState: 'changes_requested',
          comments: { count: 2, mentioned: false },
        }),
      );

      // then - not "requested changes on and left 2 comments on"
      expect(lead(posts)).toContain(
        '❌ <https://github.com/ada|@ada> requested changes and left 2 comments on *<',
      );
    });

    it('counts comments that came with no verdict in front of them', async () => {
      // given
      const { user } = await setupConnected({ dmChannelId: 'D0CACHED' });
      const posts = capturePost();

      // when
      await delivery().deliver(
        user,
        notification({
          type: NotificationType.PullRequestComment,
          comments: { count: 4, mentioned: false },
        }),
      );

      // then
      expect(lead(posts)).toContain('<https://github.com/ada|@ada> left 4 comments on *<');
    });

    it('does not let being named collapse into being commented at', async () => {
      // given - being mentioned is why somebody is poked at all
      const { user } = await setupConnected({ dmChannelId: 'D0CACHED' });
      const posts = capturePost();

      // when
      await delivery().deliver(
        user,
        notification({
          type: NotificationType.PullRequestMention,
          comments: { count: 2, mentioned: true },
        }),
      );

      // then
      expect(lead(posts)).toContain(
        '<https://github.com/ada|@ada> mentioned you in 2 comments on *<',
      );
    });

    it('quotes the one comment the batch chose, under the whole sentence', async () => {
      // given
      const { user } = await setupConnected({ dmChannelId: 'D0CACHED' });
      const posts = capturePost();

      // when
      await delivery().deliver(
        user,
        notification({
          type: NotificationType.ReviewSubmitted,
          reviewState: 'approved',
          comments: { count: 2, mentioned: false },
          excerpt: 'nit: rename this',
        }),
      );

      // then
      expect(posts[0].blocks[1].text.text).toEqual('> nit: rename this');
      expect(posts[0].text).toContain('✅ @ada approved and left 2 comments on');
    });

    it('sets the owner logo and the size of the change beside the repository', async () => {
      // given
      const { user } = await setupConnected({ dmChannelId: 'D0CACHED' });
      const posts = capturePost();

      // when
      await delivery().deliver(
        user,
        notification({
          ownerAvatarUrl: 'https://avatars.githubusercontent.com/u/8000?v=4',
          diff: { additions: 1163, deletions: 23 },
        }),
      );

      // then
      const [avatar, repository, diff] = posts[0].blocks[1].elements;
      // Sized down on the way: Slack draws this at about twenty pixels, and the original is
      // several hundred kilobytes.
      expect(avatar).toEqual({
        type: 'image',
        image_url: 'https://avatars.githubusercontent.com/u/8000?v=4&s=48',
        alt_text: 'ablaszkiewicz',
      });
      expect(repository.text).toEqual('ablaszkiewicz/proke');
      // Backticks, which is what makes Slack colour it rather than run it into the name.
      expect(diff.text).toEqual('`+1,163/-23`');
    });

    it('carries the size into the push banner, where the decision gets made', async () => {
      // given - whether to open a review request now or later is mostly a question of its size
      const { user } = await setupConnected({ dmChannelId: 'D0CACHED' });
      const posts = capturePost();

      // when
      await delivery().deliver(user, notification({ diff: { additions: 163, deletions: 23 } }));

      // then
      expect(posts[0].text).toEqual(
        '👀 @ada requested your review on Make the reel blur honest #42 · ablaszkiewicz/proke ' +
          '(+163/-23)',
      );
    });

    it('drops an avatar Slack would refuse to fetch', async () => {
      // given - Slack loads every image_url itself when the message is posted and rejects the
      // whole message if it cannot, so a stray host would cost the poke rather than the picture
      const { user } = await setupConnected({ dmChannelId: 'D0CACHED' });
      const posts = capturePost();

      // when
      await delivery().deliver(user, notification({ ownerAvatarUrl: 'http://example.com/x.png' }));

      // then - the repository name and nothing else
      expect(posts[0].blocks[1].elements).toHaveLength(1);
      expect(posts[0].blocks[1].elements[0].type).toEqual('mrkdwn');
    });

    it('leaves the line out of a poke that has no size to report', async () => {
      // given - an issue mention, and every pull request whose counts we could not establish
      const { user } = await setupConnected({ dmChannelId: 'D0CACHED' });
      const posts = capturePost();

      // when
      await delivery().deliver(user, notification({ type: NotificationType.IssueMention }));

      // then - no empty backticks, and no "+0/-0" claiming nothing changed
      expect(posts[0].blocks[1].elements).toHaveLength(1);
      expect(posts[0].text).not.toContain('(');
    });

    it('escapes what Slack would otherwise read as markup', async () => {
      // given - pull request titles are user-written text and regularly contain both
      const { user } = await setupConnected({ dmChannelId: 'D0CACHED' });
      const posts = capturePost();

      // when
      await delivery().deliver(
        user,
        notification({ title: 'Fix <Provider> & the reel', type: NotificationType.IssueMention }),
      );

      // then
      const section = posts[0].blocks[0].text.text;
      expect(section).toContain('&lt;Provider&gt; &amp; the reel');
      expect(section).toContain('https://github.com/ablaszkiewicz/proke/pull/42');
    });
  });

  describe('when it cannot be delivered', () => {
    it('is quiet about a user who has not connected Slack', async () => {
      // given - ordinary state, not a failure: people connect the two ends days apart
      const { user } = await bootstrap.utils.authUtils.setupUser();

      // when
      const outcome = await delivery().deliver(user, notification());

      // then
      expect(outcome).toEqual('no-link');
    });

    it('does not try a workspace proke was removed from', async () => {
      // given
      const { user } = await setupConnected();
      await bootstrap.models.slackWorkspaceModel.updateOne(
        { teamId: TEAM_ID },
        { $set: { revokedAt: new Date() } },
      );

      // when
      const outcome = await delivery().deliver(user, notification());

      // then
      expect(outcome).toEqual('workspace-missing');
    });

    it('marks the workspace revoked the first time the token is refused', async () => {
      // given - otherwise every event for every member rediscovers this forever
      const { user } = await setupConnected({ dmChannelId: 'D0CACHED' });
      nock('https://slack.com')
        .post('/api/chat.postMessage')
        .reply(200, { ok: false, error: 'token_revoked' });

      // when
      const outcome = await delivery().deliver(user, notification());

      // then
      expect(outcome).toEqual('workspace-missing');
      const workspace = await bootstrap.models.slackWorkspaceModel.findOne({ teamId: TEAM_ID });
      expect(workspace?.revokedAt).toBeTruthy();
    });

    it('drops the link when the person has left the workspace', async () => {
      // given
      const { user } = await setupConnected({ dmChannelId: 'D0CACHED' });
      nock('https://slack.com')
        .post('/api/chat.postMessage')
        .reply(200, { ok: false, error: 'user_not_found' });

      // when
      const outcome = await delivery().deliver(user, notification());

      // then - the workspace is fine; this one pairing is not
      expect(outcome).toEqual('unreachable');
      expect(await bootstrap.models.slackLinkModel.countDocuments()).toEqual(0);
      expect(await bootstrap.models.slackWorkspaceModel.countDocuments()).toEqual(1);
    });

    it('reopens the DM when the cached channel has gone stale', async () => {
      // given - the cache is nearly always right, and has to survive being wrong
      const { user } = await setupConnected({ dmChannelId: 'D0STALE' });
      nock('https://slack.com')
        .post('/api/chat.postMessage', (body) => body.channel === 'D0STALE')
        .reply(200, { ok: false, error: 'channel_not_found' });
      mockOpen('D0FRESH');
      const posts = capturePost();

      // when
      const outcome = await delivery().deliver(user, notification());

      // then
      expect(outcome).toEqual('sent');
      expect(posts[0].channel).toEqual('D0FRESH');

      const link = await bootstrap.models.slackLinkModel.findOne({ userId: user.id });
      expect(link?.dmChannelId).toEqual('D0FRESH');
    });
  });

  describe('from a GitHub webhook', () => {
    it('carries a real event all the way into a DM', async () => {
      // given - the whole chain: webhook, routing, preferences, Slack
      const { user } = await setupConnected({ dmChannelId: 'D0CACHED' });
      await bootstrap.models.subscriptionModel.create({
        userId: user.id,
        installationId: '5150',
      });
      const posts = capturePost();

      const payload = {
        action: 'review_requested',
        installation: { id: 5150 },
        // Public, so the chain under test here is webhook to DM rather than the repository
        // access check - that one has its own specs in the webhook suite.
        repository: { id: 314, full_name: 'ablaszkiewicz/proke', private: false },
        sender: { id: 999, login: 'ada' },
        requested_reviewer: { id: Number(user.githubId) },
        pull_request: {
          title: 'Make the reel blur honest',
          html_url: 'https://github.com/ablaszkiewicz/proke/pull/42',
          user: { id: 999 },
        },
      };
      const body = JSON.stringify(payload);

      // when
      const response = await request(server())
        .post('/webhooks/github')
        .set('content-type', 'application/json')
        .set('x-github-event', 'pull_request')
        .set(
          'x-hub-signature-256',
          'sha256=' + createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex'),
        )
        .send(body);

      // then
      expect(response.status).toEqual(202);
      await waitFor(() => posts.length > 0);
      expect(posts[0].channel).toEqual('D0CACHED');
      expect(posts[0].text).toContain('@ada requested your review');
    });
  });

  describe('the events endpoint', () => {
    const send = (payload: object, secret = SIGNING_SECRET) => {
      const body = JSON.stringify(payload);
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature =
        'v0=' + createHmac('sha256', secret).update(`v0:${timestamp}:${body}`).digest('hex');

      return request(server())
        .post('/webhooks/slack/events')
        .set('content-type', 'application/json')
        .set('x-slack-request-timestamp', timestamp)
        .set('x-slack-signature', signature)
        .send(body);
    };

    it('answers the URL verification challenge', async () => {
      // when
      const response = await send({ type: 'url_verification', challenge: 'abc123' });

      // then
      expect(response.status).toEqual(200);
      expect(response.body.challenge).toEqual('abc123');
    });

    it('rejects anything not signed by Slack', async () => {
      // when
      const response = await send({ type: 'url_verification', challenge: 'abc' }, 'wrong-secret');

      // then
      expect(response.status).toEqual(401);
    });

    it('rejects a replay of an old request', async () => {
      // given - signature is valid, the timestamp is from last week
      const body = JSON.stringify({ type: 'url_verification', challenge: 'abc' });
      const timestamp = Math.floor((Date.now() - 7 * 24 * 3600 * 1000) / 1000).toString();

      // when
      const response = await request(server())
        .post('/webhooks/slack/events')
        .set('content-type', 'application/json')
        .set('x-slack-request-timestamp', timestamp)
        .set(
          'x-slack-signature',
          'v0=' +
            createHmac('sha256', SIGNING_SECRET).update(`v0:${timestamp}:${body}`).digest('hex'),
        )
        .send(body);

      // then
      expect(response.status).toEqual(401);
    });

    it('revokes the workspace and drops its links when proke is uninstalled', async () => {
      // given
      await setupConnected();

      // when
      const response = await send({
        type: 'event_callback',
        team_id: TEAM_ID,
        event: { type: 'app_uninstalled' },
      });

      // then
      expect(response.status).toEqual(200);
      await waitFor(async () => (await bootstrap.models.slackLinkModel.countDocuments()) === 0);

      const workspace = await bootstrap.models.slackWorkspaceModel.findOne({ teamId: TEAM_ID });
      expect(workspace?.revokedAt).toBeTruthy();
    });
  });
});

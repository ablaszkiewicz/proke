import { createHmac } from 'crypto';
import * as nock from 'nock';
import * as request from 'supertest';
import { createTestApp } from '../utils/bootstrap';
import { waitFor } from '../utils/wait-for';

const WEBHOOK_SECRET = 'test-webhook-secret';
const TEAM_ID = 'T0ACME';
const INSTALLATION_ID = '5150';
const REPOSITORY = { id: 314, full_name: 'ablaszkiewicz/proke', private: false };

/** Whoever opened the pull request. Not a proke user, so nothing pokes them. */
const AUTHOR = { id: 999, login: 'author' };
/** Somebody else's review request on the same pull request. */
const OTHER_REVIEWER = { githubId: '4242', login: 'grace' };

/**
 * A review request that somebody else answers.
 *
 * The whole point of these is the case that pokes nobody: the reviewer is the sender, the
 * author is a stranger, and the only thing the event should do is quietly rewrite a message
 * that went out an hour ago.
 */
describe('Poke resolution', () => {
  let bootstrap: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    process.env.GH_APP_WEBHOOK_SECRET = WEBHOOK_SECRET;
    process.env.SLACK_TOKEN_ENCRYPTION_KEY = 'test-encryption-key';

    bootstrap = await createTestApp();
  });

  beforeEach(async () => {
    await bootstrap.methods.beforeEach();
  });

  afterAll(async () => {
    await bootstrap.methods.afterAll();
  });

  const send = (event: string, payload: object) => {
    const body = JSON.stringify(payload);
    const signature = 'sha256=' + createHmac('sha256', secretOf()).update(body).digest('hex');

    return request(bootstrap.app.getHttpServer())
      .post('/webhooks/github')
      .set('content-type', 'application/json')
      .set('x-github-event', event)
      .set('x-hub-signature-256', signature)
      .send(body);
  };

  const secretOf = () => WEBHOOK_SECRET;

  /** Somebody poke can actually reach: opted in, workspace installed, DM channel already known. */
  const setupReviewer = async (
    options: { githubId?: string; githubLogin?: string; dmChannelId?: string } = {},
  ) => {
    const { user } = await bootstrap.utils.authUtils.setupUser({
      githubId: options.githubId ?? '1234',
      githubLogin: options.githubLogin ?? 'ablaszkiewicz',
    });

    await bootstrap.models.subscriptionModel.create({
      userId: user.id,
      installationId: INSTALLATION_ID,
    });
    await bootstrap.models.slackWorkspaceModel.findOneAndUpdate(
      { teamId: TEAM_ID },
      { teamId: TEAM_ID, teamName: 'Acme', botUserId: 'B0PROKE', botToken: 'xoxb-workspace-token' },
      { upsert: true },
    );
    await bootstrap.models.slackLinkModel.create({
      userId: user.id,
      teamId: TEAM_ID,
      slackUserId: `U${options.githubId ?? '1234'}`,
      dmChannelId: options.dmChannelId ?? 'D0ADA',
    });

    return user;
  };

  const reviewRequested = (reviewerGithubId: string, number = 9) => ({
    action: 'review_requested',
    installation: { id: Number(INSTALLATION_ID) },
    requested_reviewer: { id: Number(reviewerGithubId), login: 'reviewer' },
    pull_request: {
      number,
      title: 'Wire up webhooks',
      html_url: `https://github.com/ablaszkiewicz/proke/pull/${number}`,
      user: AUTHOR,
      // Present so the router never goes to GitHub for the line counts.
      additions: 163,
      deletions: 23,
    },
    repository: REPOSITORY,
    sender: AUTHOR,
  });

  const reviewSubmitted = (reviewer: { id: number; login: string }, state: string, number = 9) => ({
    action: 'submitted',
    installation: { id: Number(INSTALLATION_ID) },
    review: {
      id: 77,
      state,
      user: reviewer,
      html_url: `https://github.com/ablaszkiewicz/proke/pull/${number}#pullrequestreview-77`,
    },
    pull_request: {
      number,
      title: 'Wire up webhooks',
      html_url: `https://github.com/ablaszkiewicz/proke/pull/${number}`,
      user: AUTHOR,
    },
    repository: REPOSITORY,
    sender: reviewer,
  });

  const pullRequestClosed = (merged: boolean, number = 9) => ({
    action: 'closed',
    installation: { id: Number(INSTALLATION_ID) },
    pull_request: {
      number,
      merged,
      title: 'Wire up webhooks',
      html_url: `https://github.com/ablaszkiewicz/proke/pull/${number}`,
      user: AUTHOR,
      additions: 163,
      deletions: 23,
    },
    repository: REPOSITORY,
    sender: { id: 555, login: 'maintainer' },
  });

  /** Slack accepting posts, and telling us where it put them - the half chat.update needs. */
  const capturePosts = (messageTs = '1700000000.000100') => {
    const posts: any[] = [];

    nock('https://slack.com')
      .post('/api/chat.postMessage', (body) => {
        posts.push(body);
        return true;
      })
      .times(5)
      .reply(200, { ok: true, channel: 'D0ADA', ts: messageTs });

    return posts;
  };

  const captureUpdates = (response: object = { ok: true }) => {
    const updates: any[] = [];

    nock('https://slack.com')
      .post('/api/chat.update', (body) => {
        updates.push(body);
        return true;
      })
      .times(5)
      .reply(200, response);

    return updates;
  };

  /** The one line the message leads with. */
  const lead = (message: any) => message.blocks[0].text.text;

  /** The last element of the context row, which is where a resolution lands. */
  const footer = (message: any) => {
    const elements = message.blocks[message.blocks.length - 1].elements;

    return elements[elements.length - 1].text;
  };

  const rows = () => bootstrap.models.pokeMessageModel.find({}).lean().exec();

  /** Sends the review request and waits until proke has filed away where it landed. */
  const pokeReviewer = async (githubId: string, number = 9) => {
    await send('pull_request', reviewRequested(githubId, number)).expect(202);
    await waitFor(async () => (await rows()).length > 0);
  };

  describe('when somebody else reviews', () => {
    it('strikes the request through and names who did it', async () => {
      // given
      await setupReviewer({ githubId: '1234' });
      capturePosts();
      await pokeReviewer('1234');

      const updates = captureUpdates();

      // when - person C, who is neither the author nor the person who was asked
      await send(
        'pull_request_review',
        reviewSubmitted({ id: 4242, login: 'grace' }, 'approved'),
      ).expect(202);

      // then
      await waitFor(() => updates.length > 0);
      expect(updates[0].channel).toEqual('D0ADA');
      expect(updates[0].ts).toEqual('1700000000.000100');
      // The same message, struck through - not a new one, and not a different sentence.
      expect(lead(updates[0])).toEqual(
        '~@author requested your review on ' +
          '<https://github.com/ablaszkiewicz/proke/pull/9|Wire up webhooks #9>~',
      );
      expect(footer(updates[0])).toEqual('✅ approved by @grace');
      // Everything the original said about the change survives the edit.
      // No avatar on this payload, so the context row is the name, the size, and the verdict.
      expect(updates[0].blocks[1].elements[0].text).toEqual('ablaszkiewicz/proke');
      expect(updates[0].blocks[1].elements[1].text).toEqual('`+163/-23`');
    });

    it('says so in the fallback text, where tildes would only be tildes', async () => {
      // given
      await setupReviewer({ githubId: '1234' });
      capturePosts();
      await pokeReviewer('1234');
      const updates = captureUpdates();

      // when
      await send(
        'pull_request_review',
        reviewSubmitted({ id: 4242, login: 'grace' }, 'approved'),
      ).expect(202);

      // then
      await waitFor(() => updates.length > 0);
      expect(updates[0].text).toEqual(
        '✅ approved by @grace · @author requested your review on Wire up webhooks #9 · ' +
          'ablaszkiewicz/proke (+163/-23)',
      );
    });

    it('forgets the message once it has been struck through', async () => {
      // given
      await setupReviewer({ githubId: '1234' });
      capturePosts();
      await pokeReviewer('1234');
      const updates = captureUpdates();

      // when
      await send(
        'pull_request_review',
        reviewSubmitted({ id: 4242, login: 'grace' }, 'approved'),
      ).expect(202);
      await waitFor(() => updates.length > 0);

      // then - nothing is left to edit a second time
      await waitFor(async () => (await rows()).length === 0);
    });

    it('strikes through everybody who was waiting, not just the first', async () => {
      // given - two people were asked, and neither of them is the one who reviewed
      await setupReviewer({ githubId: '1234', githubLogin: 'ablaszkiewicz' });
      await setupReviewer({
        githubId: OTHER_REVIEWER.githubId,
        githubLogin: OTHER_REVIEWER.login,
        dmChannelId: 'D0GRACE',
      });
      capturePosts();
      await send('pull_request', reviewRequested('1234')).expect(202);
      await send('pull_request', reviewRequested(OTHER_REVIEWER.githubId)).expect(202);
      await waitFor(async () => (await rows()).length === 2);

      const updates = captureUpdates();

      // when
      await send(
        'pull_request_review',
        reviewSubmitted({ id: 777, login: 'linus' }, 'approved'),
      ).expect(202);

      // then
      await waitFor(() => updates.length === 2);
      expect(updates.every((update) => footer(update) === '✅ approved by @linus')).toEqual(true);
    });
  });

  describe('when the person who was asked reviews it themselves', () => {
    it('says so in the second person rather than naming them back at themselves', async () => {
      // given
      await setupReviewer({ githubId: '1234' });
      capturePosts();
      await pokeReviewer('1234');
      const updates = captureUpdates();

      // when
      await send(
        'pull_request_review',
        reviewSubmitted({ id: 1234, login: 'ablaszkiewicz' }, 'approved'),
      ).expect(202);

      // then
      await waitFor(() => updates.length > 0);
      expect(footer(updates[0])).toEqual('✅ you approved this');
    });

    it('strikes through a request for changes too - it is answered either way', async () => {
      // given
      await setupReviewer({ githubId: '1234' });
      capturePosts();
      await pokeReviewer('1234');
      const updates = captureUpdates();

      // when
      await send(
        'pull_request_review',
        reviewSubmitted({ id: 1234, login: 'ablaszkiewicz' }, 'changes_requested'),
      ).expect(202);

      // then
      await waitFor(() => updates.length > 0);
      expect(footer(updates[0])).toEqual('❌ you requested changes');
    });
  });

  describe('when the pull request goes away underneath the request', () => {
    it('strikes it through as merged', async () => {
      // given
      await setupReviewer({ githubId: '1234' });
      capturePosts();
      await pokeReviewer('1234');
      const updates = captureUpdates();

      // when
      await send('pull_request', pullRequestClosed(true)).expect(202);

      // then
      await waitFor(() => updates.length > 0);
      expect(footer(updates[0])).toEqual('✅ merged by @maintainer');
    });

    it('strikes it through as closed when it was abandoned', async () => {
      // given
      await setupReviewer({ githubId: '1234' });
      capturePosts();
      await pokeReviewer('1234');
      const updates = captureUpdates();

      // when
      await send('pull_request', pullRequestClosed(false)).expect(202);

      // then
      await waitFor(() => updates.length > 0);
      expect(footer(updates[0])).toEqual('🚫 closed by @maintainer');
    });
  });

  describe('what does not settle a review request', () => {
    /**
     * Nothing to wait for, so the assertion is a quiet interval. Long enough that the detached
     * handler has comfortably run by the time it ends.
     */
    const quietly = async () => new Promise((resolve) => setTimeout(resolve, 200));

    it('leaves it alone when the review reached no verdict', async () => {
      // given
      await setupReviewer({ githubId: '1234' });
      capturePosts();
      await pokeReviewer('1234');
      const updates = captureUpdates();

      // when - GitHub keeps the request pending on a comment-only review, and so do we
      await send(
        'pull_request_review',
        reviewSubmitted({ id: 4242, login: 'grace' }, 'commented'),
      ).expect(202);
      await quietly();

      // then
      expect(updates).toEqual([]);
      expect(await rows()).toHaveLength(1);
    });

    it('says nothing about a pull request nobody was asked to review', async () => {
      // given - connected, but never poked about this pull request
      await setupReviewer({ githubId: '1234' });
      const updates = captureUpdates();

      // when
      await send(
        'pull_request_review',
        reviewSubmitted({ id: 4242, login: 'grace' }, 'approved', 11),
      ).expect(202);
      await quietly();

      // then
      expect(updates).toEqual([]);
    });

    it('remembers review requests and nothing else', async () => {
      // given - a merge poke to the author, who is a proke user this time
      const author = await setupReviewer({ githubId: String(AUTHOR.id) });
      capturePosts();

      // when
      await send('pull_request', pullRequestClosed(true)).expect(202);
      await quietly();

      // then - the poke went out, but a merge is not a thing that can later become untrue
      expect(await rows()).toEqual([]);
      expect(author.id).toBeDefined();
    });
  });

  describe('when Slack will not play along', () => {
    it('drops the row when the message is no longer there', async () => {
      // given
      await setupReviewer({ githubId: '1234' });
      capturePosts();
      await pokeReviewer('1234');
      captureUpdates({ ok: false, error: 'message_not_found' });

      // when
      await send(
        'pull_request_review',
        reviewSubmitted({ id: 4242, login: 'grace' }, 'approved'),
      ).expect(202);

      // then - nothing will ever edit that message, so nothing is kept about it
      await waitFor(async () => (await rows()).length === 0);
    });

    it('keeps the row when the failure might not last', async () => {
      // given
      await setupReviewer({ githubId: '1234' });
      capturePosts();
      await pokeReviewer('1234');
      const updates = captureUpdates({ ok: false, error: 'internal_error' });

      // when
      await send(
        'pull_request_review',
        reviewSubmitted({ id: 4242, login: 'grace' }, 'approved'),
      ).expect(202);
      await waitFor(() => updates.length > 0);

      // then - the next thing to happen to this pull request gets to try again
      expect(await rows()).toHaveLength(1);
    });
  });
});

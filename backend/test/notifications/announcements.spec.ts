import * as nock from 'nock';
import { announcementProblems } from '../../src/notifications/announcements/announcement-rules';
import { Announcement } from '../../src/notifications/announcements/announcement.interface';
import { ANNOUNCEMENTS } from '../../src/notifications/announcements/announcements';
import { getEnvConfig } from '../../src/shared/configs/env-configs';
import { createTestApp } from '../utils/bootstrap';

const TEAM_ID = 'T0ACME';

const NEWS: Announcement = {
  id: '2026-09-25-something-new',
  text: 'Something new in proke.',
  body: '*Something new.* Go and look.',
  buttons: [
    { label: 'Configure it', url: '/app' },
    { label: 'Read more', url: 'https://example.com/changelog' },
  ],
};

const MORE_NEWS: Announcement = {
  id: '2026-09-26-something-else',
  text: 'Something else in proke.',
};

/**
 * Announcements: who gets one, and that nobody gets one twice.
 *
 * Each spec sends its own list rather than the real one, so adding an announcement to the product
 * never changes what these assert.
 */
describe('Announcements', () => {
  let bootstrap: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    process.env.TOKEN_ENCRYPTION_KEY = 'test-encryption-key';

    bootstrap = await createTestApp();
  });

  beforeEach(async () => {
    await bootstrap.methods.beforeEach();
  });

  afterAll(async () => {
    await bootstrap.methods.afterAll();
  });

  const announcements = () => bootstrap.services.announcementService;

  /** Registered even where nothing should be sent, so an accidental post fails an assertion. */
  const capturePost = () => {
    const posts: any[] = [];

    nock('https://slack.com')
      .post('/api/chat.postMessage', (body) => {
        posts.push(body);
        return true;
      })
      .times(10)
      .reply(200, { ok: true });

    return posts;
  };

  /** Somebody with Slack connected end to end, in a workspace of their own. */
  const connectedUser = async (
    options: { slackUserId?: string; linkedAt?: Date; revoked?: boolean } = {},
  ) => {
    const { user } = await bootstrap.utils.authUtils.setupUser();
    const teamId = `${TEAM_ID}-${user.id}`;
    const slackUserId = options.slackUserId ?? 'U0ADA';

    await bootstrap.models.slackWorkspaceModel.create({
      teamId,
      teamName: 'Acme',
      botUserId: 'B0PROKE',
      botToken: 'xoxb-workspace-token',
      ...(options.revoked ? { revokedAt: new Date() } : {}),
    });
    const link = await bootstrap.models.slackLinkModel.create({
      userId: user.id,
      teamId,
      slackUserId,
      dmChannelId: `D${slackUserId}`,
    });

    // Past the schema's timestamps, which would stamp now over whatever create was given.
    if (options.linkedAt) {
      await bootstrap.models.slackLinkModel.collection.updateOne(
        { _id: link._id },
        { $set: { createdAt: options.linkedAt } },
      );
    }

    return user;
  };

  describe('the real list', () => {
    it('breaks none of the rules', () => {
      expect(announcementProblems(ANNOUNCEMENTS)).toEqual([]);
    });
  });

  describe('who gets one', () => {
    it('sends it to everybody with Slack connected, buttons and all', async () => {
      await connectedUser({ slackUserId: 'U0ADA' });
      await connectedUser({ slackUserId: 'U0BOB' });
      const posts = capturePost();

      await announcements().run([NEWS]);

      expect(posts.map((post) => post.channel).sort()).toEqual(['DU0ADA', 'DU0BOB']);
      expect(posts[0].text).toEqual('Something new in proke.');
      expect(posts[0].blocks).toEqual([
        { type: 'section', text: { type: 'mrkdwn', text: '*Something new.* Go and look.' } },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Configure it' },
              url: `${getEnvConfig().app.url}/app`,
            },
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Read more' },
              url: 'https://example.com/changelog',
            },
          ],
        },
      ]);
    });

    it('leaves out anybody who has not connected Slack', async () => {
      const { user } = await bootstrap.utils.authUtils.setupUser();
      const posts = capturePost();

      await announcements().run([NEWS]);

      expect(posts).toHaveLength(0);
      expect(
        await bootstrap.models.announcementDeliveryModel.countDocuments({ userId: user.id }),
      ).toEqual(0);
    });

    it('sends nothing to somebody who connected after it went out', async () => {
      const wentOut = new Date(Date.now() - 60 * 60_000);
      await bootstrap.models.announcementRunModel.create({
        announcementId: NEWS.id,
        startedAt: wentOut,
      });
      // Connected before, but the start that went out never reached them - a deploy cut it short.
      await connectedUser({ slackUserId: 'U0ADA', linkedAt: new Date(wentOut.getTime() - 1) });
      await connectedUser({ slackUserId: 'U0BOB' });
      const posts = capturePost();

      await announcements().run([NEWS]);

      expect(posts.map((post) => post.channel)).toEqual(['DU0ADA']);
    });

    it('sends the whole list, oldest first', async () => {
      await connectedUser();
      const posts = capturePost();

      await announcements().run([NEWS, MORE_NEWS]);

      expect(posts.map((post) => post.text)).toEqual([
        'Something new in proke.',
        'Something else in proke.',
      ]);
      // Without a body, the text is the message too.
      expect(posts[1].blocks).toEqual([
        { type: 'section', text: { type: 'mrkdwn', text: 'Something else in proke.' } },
      ]);
    });
  });

  describe('only once', () => {
    it('sends nothing on the next start', async () => {
      await connectedUser();
      const first = capturePost();
      await announcements().run([NEWS]);
      expect(first).toHaveLength(1);

      nock.cleanAll();
      const second = capturePost();
      await announcements().run([NEWS]);

      expect(second).toHaveLength(0);
    });

    it('sends once when two starts overlap', async () => {
      await connectedUser();
      const posts = capturePost();

      await Promise.all([announcements().run([NEWS]), announcements().run([NEWS])]);

      expect(posts).toHaveLength(1);
    });

    it('records a copy Slack could not deliver, and does not try it again', async () => {
      const user = await connectedUser({ revoked: true });
      capturePost();

      await announcements().run([NEWS]);
      await bootstrap.models.slackWorkspaceModel.updateMany({}, { $unset: { revokedAt: 1 } });
      const posts = capturePost();
      await announcements().run([NEWS]);

      expect(posts).toHaveLength(0);
      expect(
        await bootstrap.models.announcementDeliveryModel.findOne({ userId: user.id }).lean(),
      ).toMatchObject({ announcementId: NEWS.id, outcome: 'workspace-missing' });
    });
  });

  describe('a list that breaks the rules', () => {
    it('sends none of it', async () => {
      await connectedUser();
      const posts = capturePost();

      await announcements().run([NEWS, { ...MORE_NEWS, id: NEWS.id }]);

      expect(posts).toHaveLength(0);
    });

    it.each([
      ['an id without a date', { ...NEWS, id: 'something-new' }],
      ['an empty text', { ...NEWS, text: ' ' }],
      ['a button to plain http', { ...NEWS, buttons: [{ label: 'Go', url: 'http://x.io' }] }],
      ['a button to another host', { ...NEWS, buttons: [{ label: 'Go', url: '//x.io' }] }],
      ['a button without a label', { ...NEWS, buttons: [{ label: '', url: '/app' }] }],
    ])('refuses %s', (_, announcement) => {
      expect(announcementProblems([announcement])).toHaveLength(1);
    });
  });
});

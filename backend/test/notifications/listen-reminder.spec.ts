import { createHmac } from 'crypto';
import * as nock from 'nock';
import * as request from 'supertest';
import { LISTEN_REMINDER_STOP_ACTION } from '../../src/notifications/delivery/slack-message';
import { getEnvConfig } from '../../src/shared/configs/env-configs';
import { createTestApp } from '../utils/bootstrap';
import { waitFor } from '../utils/wait-for';

const TEAM_ID = 'T0ACME';
const SIGNING_SECRET = 'slack-signing-secret';
const DAY_MS = 24 * 60 * 60_000;

/**
 * The weekly reminder to somebody with Slack connected who listens to nothing: who gets it, how
 * often, and that "Never remind me again" means it.
 */
describe('Listen reminder', () => {
  let bootstrap: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    process.env.SLACK_SIGNING_SECRET = SIGNING_SECRET;
    process.env.TOKEN_ENCRYPTION_KEY = 'test-encryption-key';

    bootstrap = await createTestApp();
  });

  beforeEach(async () => {
    await bootstrap.methods.beforeEach();
  });

  afterAll(async () => {
    await bootstrap.methods.afterAll();
  });

  const reminders = () => bootstrap.services.listenReminderService;
  const server = () => bootstrap.app.getHttpServer();

  /** Far enough on that every link made during the spec is over a week old. */
  const aWeekOn = () => new Date(Date.now() + 8 * DAY_MS);

  /** Registered even where nothing should be sent, so an accidental post fails an assertion. */
  const capture = (method: 'chat.postMessage' | 'chat.update') => {
    const calls: any[] = [];

    nock('https://slack.com')
      .post(`/api/${method}`, (body) => {
        calls.push(body);
        return true;
      })
      .times(10)
      .reply(200, { ok: true, channel: 'D0ADA', ts: '1700000000.000100' });

    return calls;
  };

  /** Somebody with Slack connected end to end, and - unless told otherwise - listening to nothing. */
  const connectedUser = async (options: { listening?: boolean } = {}) => {
    const { user } = await bootstrap.utils.authUtils.setupUser();
    const teamId = `${TEAM_ID}-${user.id}`;

    await bootstrap.models.slackWorkspaceModel.create({
      teamId,
      teamName: 'Acme',
      botUserId: 'B0PROKE',
      botToken: 'xoxb-workspace-token',
    });
    await bootstrap.models.slackLinkModel.create({
      userId: user.id,
      teamId,
      slackUserId: 'U0ADA',
      dmChannelId: 'D0ADA',
    });

    if (options.listening) {
      await bootstrap.models.subscriptionModel.create({ userId: user.id, installationId: '1' });
    }

    return { user, teamId };
  };

  /** A button press, form-encoded and signed the way Slack sends one. */
  const press = (payload: object, secret = SIGNING_SECRET) => {
    const body = `payload=${encodeURIComponent(JSON.stringify(payload))}`;
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature =
      'v0=' + createHmac('sha256', secret).update(`v0:${timestamp}:${body}`).digest('hex');

    return request(server())
      .post('/webhooks/slack/interactions')
      .set('content-type', 'application/x-www-form-urlencoded')
      .set('x-slack-request-timestamp', timestamp)
      .set('x-slack-signature', signature)
      .send(body);
  };

  const neverRemindMe = (userId: string, teamId: string) => ({
    type: 'block_actions',
    team: { id: teamId },
    user: { id: 'U0ADA', team_id: teamId },
    container: { type: 'message', channel_id: 'D0ADA', message_ts: '1700000000.000100' },
    actions: [{ type: 'button', action_id: LISTEN_REMINDER_STOP_ACTION, value: userId }],
  });

  describe('who gets one', () => {
    it('reminds somebody who listens to nothing, with a way to the settings and a way out', async () => {
      const { user } = await connectedUser();
      const posts = capture('chat.postMessage');

      await reminders().sweep(aWeekOn());

      expect(posts).toHaveLength(1);
      expect(posts[0].channel).toEqual('D0ADA');
      expect(posts[0].text).toEqual(
        "You're not listening to any repositories in proke yet, so no prokes will arrive.",
      );
      expect(posts[0].blocks[1]).toEqual({
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Open proke settings' },
            url: `${getEnvConfig().app.url}/app`,
            style: 'primary',
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Never remind me again' },
            action_id: LISTEN_REMINDER_STOP_ACTION,
            value: user.id,
          },
        ],
      });
    });

    it('leaves out somebody who listens to an organisation', async () => {
      await connectedUser({ listening: true });
      const posts = capture('chat.postMessage');

      await reminders().sweep(aWeekOn());

      expect(posts).toHaveLength(0);
    });

    it('leaves out somebody who has not connected Slack', async () => {
      await bootstrap.utils.authUtils.setupUser();
      const posts = capture('chat.postMessage');

      await reminders().sweep(aWeekOn());

      expect(posts).toHaveLength(0);
    });

    it('gives somebody who has only just connected a week to get round to it', async () => {
      await connectedUser();
      const posts = capture('chat.postMessage');

      await reminders().sweep(new Date(Date.now() + 6 * DAY_MS));

      expect(posts).toHaveLength(0);
    });
  });

  describe('every seven days', () => {
    it('sends nothing more until the week is up, then sends again', async () => {
      await connectedUser();
      const posts = capture('chat.postMessage');
      const first = aWeekOn();

      await reminders().sweep(first);
      await reminders().sweep(new Date(first.getTime() + DAY_MS));
      await reminders().sweep(new Date(first.getTime() + 6 * DAY_MS));
      expect(posts).toHaveLength(1);

      await reminders().sweep(new Date(first.getTime() + 7 * DAY_MS));
      expect(posts).toHaveLength(2);
    });

    it('stops once they start listening', async () => {
      const { user } = await connectedUser();
      const posts = capture('chat.postMessage');
      const first = aWeekOn();

      await reminders().sweep(first);
      await bootstrap.models.subscriptionModel.create({ userId: user.id, installationId: '1' });
      await reminders().sweep(new Date(first.getTime() + 7 * DAY_MS));

      expect(posts).toHaveLength(1);
    });
  });

  describe('Never remind me again', () => {
    it('stops the reminders for good, and says so on the message', async () => {
      const { user, teamId } = await connectedUser();
      const updates = capture('chat.update');

      const response = await press(neverRemindMe(user.id, teamId));

      expect(response.status).toEqual(200);
      await waitFor(() => updates.length === 1);
      expect(updates[0]).toMatchObject({ channel: 'D0ADA', ts: '1700000000.000100' });
      // The way out is gone; the way to the settings stays.
      expect(updates[0].blocks[1].elements).toEqual([
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Open proke settings' },
          url: `${getEnvConfig().app.url}/app`,
        },
      ]);
      expect(updates[0].blocks[2].elements[0].text).toEqual(
        "Got it - proke won't remind you about this again.",
      );

      const posts = capture('chat.postMessage');
      await reminders().sweep(aWeekOn());
      await reminders().sweep(new Date(aWeekOn().getTime() + 30 * DAY_MS));

      expect(posts).toHaveLength(0);
    });

    it('stops only the person it was sent to', async () => {
      const { user, teamId } = await connectedUser();
      await connectedUser();
      capture('chat.update');

      await press(neverRemindMe(user.id, teamId));
      await waitFor(async () =>
        Boolean(
          (await bootstrap.models.userModel.findById(user.id).lean())?.listenReminderStoppedAt,
        ),
      );

      const posts = capture('chat.postMessage');
      await reminders().sweep(aWeekOn());

      expect(posts).toHaveLength(1);
    });

    it('refuses a press Slack did not sign', async () => {
      const { user, teamId } = await connectedUser();

      const response = await press(neverRemindMe(user.id, teamId), 'not-the-secret');

      expect(response.status).toEqual(401);
      expect(
        (await bootstrap.models.userModel.findById(user.id).lean())?.listenReminderStoppedAt,
      ).toBeUndefined();
    });

    it('acknowledges any other button and does nothing with it', async () => {
      const { user, teamId } = await connectedUser();
      const updates = capture('chat.update');

      const response = await press({
        ...neverRemindMe(user.id, teamId),
        // The settings link, which Slack reports too once interactivity is on.
        actions: [{ type: 'button', action_id: 'aB3d', url: `${getEnvConfig().app.url}/app` }],
      });

      expect(response.status).toEqual(200);
      const posts = capture('chat.postMessage');
      await reminders().sweep(aWeekOn());

      expect(posts).toHaveLength(1);
      expect(updates).toHaveLength(0);
    });
  });
});

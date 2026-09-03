import * as nock from 'nock';
import * as request from 'supertest';
import { SlackConnectionStatus } from '../../src/slack/dto/slack-connection.response';
import { createTestApp } from '../utils/bootstrap';

const TEAM = { id: 'T0ACME', name: 'Acme' };

describe('Slack connection', () => {
  let bootstrap: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    process.env.SLACK_CLIENT_ID = 'slack-client-id';
    process.env.SLACK_CLIENT_SECRET = 'slack-client-secret';
    process.env.SLACK_SIGNING_SECRET = 'slack-signing-secret';
    process.env.SLACK_REDIRECT_URI = 'https://proke.test/app/callbacks/slack';
    process.env.TOKEN_ENCRYPTION_KEY = 'test-encryption-key';

    bootstrap = await createTestApp();
  });

  beforeEach(async () => {
    await bootstrap.methods.beforeEach();
  });

  afterAll(async () => {
    await bootstrap.methods.afterAll();
  });

  const server = () => bootstrap.app.getHttpServer();

  const readConnection = (token: string) =>
    request(server()).get('/slack/connection').set('authorization', `Bearer ${token}`);

  /** The state proke minted for this user, taken from the URL it would have sent them to. */
  const stateFor = async (token: string): Promise<string> => {
    const response = await readConnection(token);
    return new URL(response.body.connectUrl).searchParams.get('state') as string;
  };

  const mockIdentity = (slackUserId: string, handle: string) =>
    nock('https://slack.com')
      .post('/api/users.identity')
      .reply(200, { ok: true, user: { id: slackUserId, name: handle }, team: TEAM });

  const mockExchange = (body: object) =>
    nock('https://slack.com')
      .post('/api/oauth.v2.access')
      .reply(200, { ok: true, team: TEAM, ...body });

  /**
   * The DM the first poke goes down. Every connection that comes out linked sends one, so any
   * test that gets that far has to have somewhere for it to land.
   */
  const mockDirectMessage = (): { posted: () => any } => {
    let posted: any;

    nock('https://slack.com')
      .post('/api/conversations.open')
      .reply(200, { ok: true, channel: { id: 'D0ADA' } });
    nock('https://slack.com')
      .post('/api/chat.postMessage', (body) => {
        posted = body;
        return true;
      })
      .reply(200, { ok: true });

    return { posted: () => posted };
  };

  const connect = (token: string, state: string, code = 'slack-code') =>
    request(server())
      .post('/slack/connection')
      .set('authorization', `Bearer ${token}`)
      .send({ code, state });

  describe('reading it', () => {
    it('starts unlinked, offering identity only', async () => {
      // given
      const { token } = await bootstrap.utils.authUtils.setupUser();

      // when
      const response = await readConnection(token);

      // then
      expect(response.status).toEqual(200);
      expect(response.body.status).toEqual(SlackConnectionStatus.Unlinked);
      expect(response.body.configured).toEqual(true);
      expect(response.body.installUrl).toBeUndefined();

      // The whole point of the two-step flow: nobody is asked to install anything until we
      // know a workspace is actually missing it.
      const url = new URL(response.body.connectUrl);
      expect(url.searchParams.get('user_scope')).toEqual('identity.basic');
      expect(url.searchParams.get('scope')).toBeNull();
    });
  });

  describe('the redirect Slack is pointed at', () => {
    it('hands the code back to the frontend, which is where the session is', async () => {
      // given - registered with Slack because it must be https; the frontend is not

      // when - Slack sends the browser here, with no bearer token on it
      const response = await request(server()).get(
        '/slack/oauth/callback?code=slack-code&state=signed-state',
      );

      // then
      expect(response.status).toEqual(302);
      expect(response.headers.location).toEqual(
        'http://localhost:49173/app/callbacks/slack?code=slack-code&state=signed-state',
      );
    });

    it('passes a refusal through rather than swallowing it', async () => {
      // when - the user backed out on Slack's consent screen
      const response = await request(server()).get('/slack/oauth/callback?error=access_denied');

      // then
      expect(response.headers.location).toEqual(
        'http://localhost:49173/app/callbacks/slack?error=access_denied',
      );
    });

    it('ignores anything else on the query, so it cannot be aimed elsewhere', async () => {
      // given - the base is server config; only known keys are copied through
      const response = await request(server()).get(
        '/slack/oauth/callback?code=c&redirect=https://evil.example.com&next=/x',
      );

      // then
      expect(response.headers.location).toEqual(
        'http://localhost:49173/app/callbacks/slack?code=c',
      );
    });
  });

  describe('signing in with Slack', () => {
    it('links the identity and then asks for the install, preselecting the workspace', async () => {
      // given - an identity-only authorization: no bot token comes back
      const { token, user } = await bootstrap.utils.authUtils.setupUser();
      const state = await stateFor(token);
      mockExchange({ authed_user: { id: 'U0ADA', access_token: 'xoxp-user' } });
      mockIdentity('U0ADA', 'ada');

      // when
      const response = await connect(token, state);

      // then - we know who they are, but cannot reach them yet
      expect(response.status).toEqual(201);
      expect(response.body.status).toEqual(SlackConnectionStatus.WorkspaceMissing);
      expect(response.body.teamName).toEqual('Acme');
      expect(response.body.slackHandle).toEqual('ada');

      const installUrl = new URL(response.body.installUrl);
      expect(installUrl.searchParams.get('scope')).toEqual('chat:write,im:write');
      // Someone in five workspaces must not be able to install it into the wrong one.
      expect(installUrl.searchParams.get('team')).toEqual(TEAM.id);

      const link = await bootstrap.models.slackLinkModel.findOne({ userId: user.id });
      expect(link).toMatchObject({ teamId: TEAM.id, slackUserId: 'U0ADA', slackHandle: 'ada' });
    });

    it('links on the id alone when the identity call fails', async () => {
      // given - the handle is display data; losing it must not cost the connection
      const { token, user } = await bootstrap.utils.authUtils.setupUser();
      const state = await stateFor(token);
      mockExchange({ authed_user: { id: 'U0ADA', access_token: 'xoxp-user' } });
      nock('https://slack.com')
        .post('/api/users.identity')
        .reply(200, { ok: false, error: 'invalid_auth' });

      // when
      const response = await connect(token, state);

      // then
      expect(response.status).toEqual(201);
      const link = await bootstrap.models.slackLinkModel.findOne({ userId: user.id });
      expect(link).toMatchObject({ slackUserId: 'U0ADA' });
      expect(link?.slackHandle).toBeUndefined();
    });

    it('refuses a state minted for somebody else', async () => {
      // given - the code is fine; the round trip belongs to another account
      const { token: victimToken } = await bootstrap.utils.authUtils.setupUser();
      const { token: attackerToken } = await bootstrap.utils.authUtils.setupUser();
      const victimState = await stateFor(victimToken);

      // when
      const response = await connect(attackerToken, victimState);

      // then
      expect(response.status).toEqual(400);
      expect(await bootstrap.models.slackLinkModel.countDocuments()).toEqual(0);
    });

    it('refuses a forged state', async () => {
      // given
      const { token } = await bootstrap.utils.authUtils.setupUser();

      // when
      const response = await connect(token, 'not-a-signed-state');

      // then
      expect(response.status).toEqual(400);
    });
  });

  describe('installing the bot', () => {
    it('stores the workspace, encrypts the token, and links the installer in one go', async () => {
      // given - an install authorization carries both the bot token and the installer
      const { token, user } = await bootstrap.utils.authUtils.setupUser();
      const state = await stateFor(token);
      mockExchange({
        access_token: 'xoxb-real-token',
        bot_user_id: 'B0PROKE',
        scope: 'chat:write,im:write',
        authed_user: { id: 'U0ADA', access_token: 'xoxp-user' },
      });
      mockIdentity('U0ADA', 'ada');
      mockDirectMessage();

      // when
      const response = await connect(token, state);

      // then
      expect(response.body.status).toEqual(SlackConnectionStatus.Linked);
      expect(response.body.teamName).toEqual('Acme');
      expect(response.body.installUrl).toBeUndefined();

      const workspace = await bootstrap.models.slackWorkspaceModel.findOne({ teamId: TEAM.id });
      expect(workspace).toMatchObject({
        teamName: 'Acme',
        botUserId: 'B0PROKE',
        installedByUserId: user.id,
      });
      // At rest it is ciphertext, not a token somebody can lift out of a database dump.
      expect(workspace?.botToken).toMatch(/^v1\./);
      expect(workspace?.botToken).not.toContain('xoxb-');
    });

    it('brings a revoked workspace back to life', async () => {
      // given - proke was uninstalled here at some point
      const { token } = await bootstrap.utils.authUtils.setupUser();
      await bootstrap.models.slackWorkspaceModel.create({
        teamId: TEAM.id,
        teamName: 'Acme',
        botUserId: 'B0PROKE',
        botToken: 'stale',
        revokedAt: new Date(),
      });
      const state = await stateFor(token);
      mockExchange({
        access_token: 'xoxb-fresh',
        bot_user_id: 'B0PROKE',
        authed_user: { id: 'U0ADA', access_token: 'xoxp-user' },
      });
      mockIdentity('U0ADA', 'ada');
      mockDirectMessage();

      // when - somebody adds it again
      const response = await connect(token, state);

      // then
      expect(response.body.status).toEqual(SlackConnectionStatus.Linked);
      const workspace = await bootstrap.models.slackWorkspaceModel.findOne({ teamId: TEAM.id });
      expect(workspace?.revokedAt).toBeFalsy();
    });

    it('links a second member without asking them to install anything', async () => {
      // given - a colleague already installed it
      const { token } = await bootstrap.utils.authUtils.setupUser();
      await bootstrap.models.slackWorkspaceModel.create({
        teamId: TEAM.id,
        teamName: 'Acme',
        botUserId: 'B0PROKE',
        botToken: 'encrypted-elsewhere',
      });
      const state = await stateFor(token);
      mockExchange({ authed_user: { id: 'U0BEN', access_token: 'xoxp-ben' } });
      mockIdentity('U0BEN', 'ben');
      mockDirectMessage();

      // when - identity only, which needs no admin
      const response = await connect(token, state);

      // then
      expect(response.body.status).toEqual(SlackConnectionStatus.Linked);
    });
  });

  describe('the first poke', () => {
    it('goes out the moment a connection is complete, without being asked for', async () => {
      // given - a workspace that already has proke, so this authorization finishes the job
      const { token, user } = await bootstrap.utils.authUtils.setupUser({
        githubLogin: 'ablaszkiewicz',
      });
      await bootstrap.models.slackWorkspaceModel.create({
        teamId: TEAM.id,
        teamName: 'Acme',
        botUserId: 'B0PROKE',
        botToken: 'plaintext-legacy-token',
      });
      const state = await stateFor(token);
      mockExchange({ authed_user: { id: 'U0ADA', access_token: 'xoxp-user' } });
      mockIdentity('U0ADA', 'ada');
      const dm = mockDirectMessage();

      // when
      const response = await connect(token, state);

      // then - the tick on the dashboard has already been proven by the time it is shown
      expect(response.body.status).toEqual(SlackConnectionStatus.Linked);
      expect(dm.posted().channel).toEqual('D0ADA');
      expect(JSON.stringify(dm.posted().blocks)).toContain('@ablaszkiewicz');

      const link = await bootstrap.models.slackLinkModel.findOne({ userId: user.id });
      expect(link?.dmChannelId).toEqual('D0ADA');
    });

    it('does not send one when the workspace still has to add proke', async () => {
      // given - identity only: there is no bot token, so there is nothing to send with
      const { token } = await bootstrap.utils.authUtils.setupUser();
      const state = await stateFor(token);
      mockExchange({ authed_user: { id: 'U0ADA', access_token: 'xoxp-user' } });
      mockIdentity('U0ADA', 'ada');

      // when - no DM is mocked, so an attempt to send one would fail this test
      const response = await connect(token, state);

      // then
      expect(response.body.status).toEqual(SlackConnectionStatus.WorkspaceMissing);
    });

    it('keeps the connection when Slack refuses the message', async () => {
      // given - the user has authorized; a workspace that will not take a DM is not their
      // problem to solve, and losing the connection over it would be
      const { token, user } = await bootstrap.utils.authUtils.setupUser();
      await bootstrap.models.slackWorkspaceModel.create({
        teamId: TEAM.id,
        teamName: 'Acme',
        botUserId: 'B0PROKE',
        botToken: 'plaintext-legacy-token',
      });
      const state = await stateFor(token);
      mockExchange({ authed_user: { id: 'U0ADA', access_token: 'xoxp-user' } });
      mockIdentity('U0ADA', 'ada');
      nock('https://slack.com')
        .post('/api/conversations.open')
        .reply(200, { ok: false, error: 'ratelimited' });

      // when
      const response = await connect(token, state);

      // then
      expect(response.status).toEqual(201);
      expect(response.body.status).toEqual(SlackConnectionStatus.Linked);
      expect(await bootstrap.models.slackLinkModel.countDocuments({ userId: user.id })).toEqual(1);
    });
  });

  describe('moving and disconnecting', () => {
    it('moves the link when the same user authorizes in another workspace', async () => {
      // given - already connected to Acme
      const { token, user } = await bootstrap.utils.authUtils.setupUser();
      await bootstrap.models.slackLinkModel.create({
        userId: user.id,
        teamId: TEAM.id,
        teamName: 'Acme',
        slackUserId: 'U0ADA',
      });
      const state = await stateFor(token);
      nock('https://slack.com')
        .post('/api/oauth.v2.access')
        .reply(200, {
          ok: true,
          team: { id: 'T0OTHER', name: 'Other' },
          authed_user: { id: 'U9ADA', access_token: 'xoxp-user' },
        });
      nock('https://slack.com')
        .post('/api/users.identity')
        .reply(200, {
          ok: true,
          user: { id: 'U9ADA', name: 'ada' },
          team: { id: 'T0OTHER', name: 'Other' },
        });

      // when
      await connect(token, state);

      // then - one destination, not two
      const links = await bootstrap.models.slackLinkModel.find({ userId: user.id });
      expect(links).toHaveLength(1);
      expect(links[0].teamId).toEqual('T0OTHER');
    });

    it('disconnects the person without uninstalling proke for their colleagues', async () => {
      // given
      const { token, user } = await bootstrap.utils.authUtils.setupUser();
      await bootstrap.models.slackWorkspaceModel.create({
        teamId: TEAM.id,
        teamName: 'Acme',
        botUserId: 'B0PROKE',
        botToken: 'encrypted',
      });
      await bootstrap.models.slackLinkModel.create({
        userId: user.id,
        teamId: TEAM.id,
        slackUserId: 'U0ADA',
      });

      // when
      const response = await request(server())
        .delete('/slack/connection')
        .set('authorization', `Bearer ${token}`);

      // then
      expect(response.status).toEqual(204);
      expect(await bootstrap.models.slackLinkModel.countDocuments()).toEqual(0);
      expect(await bootstrap.models.slackWorkspaceModel.countDocuments()).toEqual(1);
    });
  });

  describe('the test proke', () => {
    it('says what to do when there is nothing connected', async () => {
      // given
      const { token } = await bootstrap.utils.authUtils.setupUser();

      // when
      const response = await request(server())
        .post('/slack/connection/test')
        .set('authorization', `Bearer ${token}`);

      // then
      expect(response.status).toEqual(400);
      expect(response.body.message).toEqual('Connect Slack first.');
    });

    it('reports Slack’s own refusal rather than swallowing it', async () => {
      // given - connected, but the bot cannot open a DM with this person
      const { token, user } = await bootstrap.utils.authUtils.setupUser();
      await bootstrap.models.slackWorkspaceModel.create({
        teamId: TEAM.id,
        teamName: 'Acme',
        botUserId: 'B0PROKE',
        botToken: 'plaintext-legacy-token',
      });
      await bootstrap.models.slackLinkModel.create({
        userId: user.id,
        teamId: TEAM.id,
        slackUserId: 'U0ADA',
      });
      nock('https://slack.com')
        .post('/api/conversations.open')
        .reply(200, { ok: false, error: 'user_not_found' });

      // when
      const response = await request(server())
        .post('/slack/connection/test')
        .set('authorization', `Bearer ${token}`);

      // then
      expect(response.status).toEqual(400);
      expect(response.body.message).toContain('user_not_found');
    });

    it('sends one, through the whole path', async () => {
      // given
      const { token, user } = await bootstrap.utils.authUtils.setupUser({
        githubLogin: 'ablaszkiewicz',
      });
      await bootstrap.models.slackWorkspaceModel.create({
        teamId: TEAM.id,
        teamName: 'Acme',
        botUserId: 'B0PROKE',
        botToken: 'plaintext-legacy-token',
      });
      await bootstrap.models.slackLinkModel.create({
        userId: user.id,
        teamId: TEAM.id,
        slackUserId: 'U0ADA',
      });

      let posted: any;
      nock('https://slack.com')
        .post('/api/conversations.open')
        .reply(200, { ok: true, channel: { id: 'D0ADA' } });
      nock('https://slack.com')
        .post('/api/chat.postMessage', (body) => {
          posted = body;
          return true;
        })
        .reply(200, { ok: true });

      // when
      const response = await request(server())
        .post('/slack/connection/test')
        .set('authorization', `Bearer ${token}`);

      // then
      expect(response.status).toEqual(204);
      expect(posted.channel).toEqual('D0ADA');
      // The opening line is drawn at random, so what is asserted is the part that never
      // changes: this poke says it is a test, and it says who pressed the button.
      expect(posted.text).toContain('Test proke');
      expect(posted.text).toContain('@ablaszkiewicz');
    });
  });
});

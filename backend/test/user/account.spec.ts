import * as request from 'supertest';
import { createTestApp } from '../utils/bootstrap';

const TEAM_ID = 'T0ACME';

describe('Account', () => {
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

  const server = () => bootstrap.app.getHttpServer();

  describe('token encryption at rest', () => {
    it('never writes the github access token to the database in the clear', async () => {
      // given
      const { user } = await bootstrap.utils.authUtils.setupUser({
        githubAccessToken: 'gho_plaintext_would_be_a_leak',
      });

      // when - read the raw document, not the normalized one
      const stored = await bootstrap.models.userModel.findById(user.id).lean<any>().exec();

      // then
      expect(stored.githubAccessToken).toBeDefined();
      expect(stored.githubAccessToken).not.toContain('gho_plaintext_would_be_a_leak');
      // The version stamp TokenCipherService puts on everything it encrypts.
      expect(stored.githubAccessToken.startsWith('v1.')).toBe(true);
    });

    it('reads the token back usable, so encryption is transparent to callers', async () => {
      // given
      const { user } = await bootstrap.utils.authUtils.setupUser({
        githubAccessToken: 'gho_round_trip',
      });

      // when
      const readBack = await bootstrap.services.userReadService.readByIdOrThrow(user.id);

      // then
      expect(readBack.githubAccessToken).toEqual('gho_round_trip');
    });

    it('still reads a row written before encryption was turned on', async () => {
      // given - a plaintext token, as older rows carry
      const created = await bootstrap.models.userModel.create({
        githubId: '9001',
        githubAccessToken: 'gho_legacy_plaintext',
        lastActivityDate: new Date(),
      });

      // when
      const readBack = await bootstrap.services.userReadService.readByIdOrThrow(
        created._id.toString(),
      );

      // then - the cipher passes anything without its version stamp straight through
      expect(readBack.githubAccessToken).toEqual('gho_legacy_plaintext');
    });
  });

  describe('last activity', () => {
    it('stamps lastActivityDate when an authenticated request comes in', async () => {
      // given - a user who was last seen a day ago
      const { user, token } = await bootstrap.utils.authUtils.setupUser();
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      await bootstrap.models.userModel.updateOne(
        { _id: user.id },
        { $set: { lastActivityDate: yesterday } },
      );

      // when
      await request(server()).get('/users/me').set('authorization', `Bearer ${token}`);

      // then
      const stored = await bootstrap.models.userModel.findById(user.id).lean<any>().exec();
      expect(stored.lastActivityDate.getTime()).toBeGreaterThan(yesterday.getTime());
    });

    it('leaves it alone for a second request inside the same hour', async () => {
      // given
      const { user, token } = await bootstrap.utils.authUtils.setupUser();
      await request(server()).get('/users/me').set('authorization', `Bearer ${token}`);
      const afterFirst = await bootstrap.models.userModel.findById(user.id).lean<any>().exec();

      // when
      await request(server()).get('/users/me').set('authorization', `Bearer ${token}`);

      // then - the throttle held, so this is one write rather than one per request
      const afterSecond = await bootstrap.models.userModel.findById(user.id).lean<any>().exec();
      expect(afterSecond.lastActivityDate.getTime()).toEqual(afterFirst.lastActivityDate.getTime());
    });
  });

  describe('DELETE /users/me', () => {
    /** A user with something in every collection keyed on their id. */
    const setupUserWithEverything = async () => {
      const { user, token } = await bootstrap.utils.authUtils.setupUser({
        githubLogin: 'ablaszkiewicz',
        githubAccessToken: 'gho_token',
      });

      await bootstrap.models.subscriptionModel.create({
        userId: user.id,
        installationId: '5150',
        repositoryScope: 'all',
      });
      await bootstrap.models.slackLinkModel.create({
        userId: user.id,
        teamId: TEAM_ID,
        slackUserId: 'U0ADA',
      });
      await bootstrap.models.slackWorkspaceModel.create({
        teamId: TEAM_ID,
        teamName: 'Acme',
        botUserId: 'B0PROKE',
        botToken: 'xoxb-workspace-token',
        installedByUserId: user.id,
      });

      return { user, token };
    };

    it('removes the account and everything keyed to it', async () => {
      // given
      const { user, token } = await setupUserWithEverything();

      // when
      const response = await request(server())
        .delete('/users/me')
        .set('authorization', `Bearer ${token}`);

      // then
      expect(response.status).toEqual(204);
      expect(await bootstrap.models.userModel.findById(user.id).lean().exec()).toBeNull();
      expect(await bootstrap.models.subscriptionModel.countDocuments({ userId: user.id })).toEqual(
        0,
      );
      expect(await bootstrap.models.slackLinkModel.countDocuments({ userId: user.id })).toEqual(0);
    });

    it('leaves the workspace installed for everyone else, but stops pointing at the user', async () => {
      // given
      const { user, token } = await setupUserWithEverything();

      // when
      await request(server()).delete('/users/me').set('authorization', `Bearer ${token}`);

      // then - one member leaving is not grounds for uninstalling proke on their colleagues
      const workspace = await bootstrap.models.slackWorkspaceModel
        .findOne({ teamId: TEAM_ID })
        .lean<any>()
        .exec();
      expect(workspace).not.toBeNull();
      expect(workspace.installedByUserId).toBeUndefined();
      expect(user.id).toBeDefined();
    });

    it('leaves another user untouched', async () => {
      // given
      const { token } = await setupUserWithEverything();
      const other = await bootstrap.utils.authUtils.setupUser({ githubLogin: 'somebody-else' });
      await bootstrap.models.subscriptionModel.create({
        userId: other.user.id,
        installationId: '5150',
        repositoryScope: 'all',
      });

      // when
      await request(server()).delete('/users/me').set('authorization', `Bearer ${token}`);

      // then
      expect(await bootstrap.models.userModel.findById(other.user.id).lean().exec()).not.toBeNull();
      expect(
        await bootstrap.models.subscriptionModel.countDocuments({ userId: other.user.id }),
      ).toEqual(1);
    });

    it('stops accepting the deleted account token', async () => {
      // given
      const { token } = await setupUserWithEverything();
      await request(server()).delete('/users/me').set('authorization', `Bearer ${token}`);

      // when - the JWT is still cryptographically valid; the account behind it is gone
      const response = await request(server())
        .get('/users/me')
        .set('authorization', `Bearer ${token}`);

      // then
      expect(response.status).toEqual(404);
    });

    it('refuses without a session', async () => {
      // when
      const response = await request(server()).delete('/users/me');

      // then
      expect(response.status).toEqual(401);
    });
  });
});

import * as nock from 'nock';
import * as request from 'supertest';
import { ConnectionStatus } from '../../src/connections/dto/connection.response';
import { createTestApp } from '../utils/bootstrap';

describe('Connections - GitHub access', () => {
  let bootstrap: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    process.env.GH_APP_SLUG = 'proke-dev';

    bootstrap = await createTestApp();
  });

  beforeEach(async () => {
    await bootstrap.methods.beforeEach();
  });

  afterAll(async () => {
    await bootstrap.methods.afterAll();
  });

  const server = () => bootstrap.app.getHttpServer();

  const setupUser = () =>
    bootstrap.utils.authUtils.setupUser({
      githubId: '4242',
      githubLogin: 'ablaszkiewicz',
      githubAccessToken: 'gho_token',
    });

  const installation = (id: number, overrides: object = {}) => ({
    id,
    account: { id: 77, login: 'acme-corp', type: 'Organization' },
    repository_selection: 'all',
    ...overrides,
  });

  describe('a GitHub token GitHub no longer accepts', () => {
    const mockRejectedToken = (times = 1) =>
      nock('https://api.github.com')
        .get('/user/installations')
        .query(true)
        .times(times)
        .reply(401, { message: 'Bad credentials' });

    it('answers 200 with a re-auth flag rather than 401', async () => {
      // given - the user revoked proke on GitHub's side; their proke session is untouched
      mockRejectedToken();
      const { token } = await setupUser();

      // when
      const response = await request(server())
        .get('/connections')
        .set('authorization', `Bearer ${token}`);

      // then - 401 here is what the dashboard reads as "your session died" and logs them out
      expect(response.status).toEqual(200);
      expect(response.body.githubReauthRequired).toBe(true);
      expect(response.body.connections).toEqual([]);
    });

    it('drops the dead token so it is not presented again on every load', async () => {
      // given
      mockRejectedToken();
      const { user, token } = await setupUser();

      // when
      await request(server()).get('/connections').set('authorization', `Bearer ${token}`);

      // then
      const stored = await bootstrap.models.userModel.findById(user.id).lean<any>().exec();
      expect(stored.githubAccessToken).toBeUndefined();
    });

    it('reports a re-auth requirement when there is no token at all', async () => {
      // given
      const { token } = await bootstrap.utils.authUtils.setupUser({ githubId: '4242' });

      // when
      const response = await request(server())
        .get('/connections')
        .set('authorization', `Bearer ${token}`);

      // then
      expect(response.status).toEqual(200);
      expect(response.body.githubReauthRequired).toBe(true);
    });

    it('refuses a subscribe with 403, not 401', async () => {
      // given
      mockRejectedToken();
      const { token } = await setupUser();

      // when - the access check could not run, so the only safe answer is to refuse
      const response = await request(server())
        .post('/connections/5150/subscription')
        .set('authorization', `Bearer ${token}`);

      // then
      expect(response.status).toEqual(403);
      expect(response.body.message).toContain('Sign in with GitHub again');
    });

    it('says nothing about re-auth on a healthy read', async () => {
      // given
      nock('https://api.github.com')
        .get('/user/installations')
        .query(true)
        .reply(200, { total_count: 1, installations: [installation(5150)] });
      const { token } = await setupUser();

      // when
      const response = await request(server())
        .get('/connections')
        .set('authorization', `Bearer ${token}`);

      // then
      expect(response.status).toEqual(200);
      expect(response.body.githubReauthRequired).toBeUndefined();
      expect(response.body.connections).toHaveLength(1);
    });
  });

  describe('pagination', () => {
    it('follows every page rather than stopping at the first hundred', async () => {
      // given - 100 on page one is exactly a full page, so there has to be a second request
      const firstPage = Array.from({ length: 100 }, (_, index) => installation(1000 + index));
      const secondPage = [installation(9999)];

      nock('https://api.github.com')
        .get('/user/installations')
        .query({ per_page: '100', page: '1' })
        .reply(200, { total_count: 101, installations: firstPage });
      nock('https://api.github.com')
        .get('/user/installations')
        .query({ per_page: '100', page: '2' })
        .reply(200, { total_count: 101, installations: secondPage });

      const { token } = await setupUser();

      // when
      const response = await request(server())
        .get('/connections')
        .set('authorization', `Bearer ${token}`);

      // then
      expect(response.status).toEqual(200);
      expect(response.body.connections).toHaveLength(101);
      expect(nock.isDone()).toBe(true);
    });

    it('lets a user subscribe to an installation that is not on the first page', async () => {
      // given - the bug this replaces answered "you do not have access to that installation"
      const firstPage = Array.from({ length: 100 }, (_, index) => installation(1000 + index));

      nock('https://api.github.com')
        .get('/user/installations')
        .query({ per_page: '100', page: '1' })
        .reply(200, { total_count: 101, installations: firstPage });
      nock('https://api.github.com')
        .get('/user/installations')
        .query({ per_page: '100', page: '2' })
        .reply(200, { total_count: 101, installations: [installation(9999)] });

      const { token } = await setupUser();

      // when
      const response = await request(server())
        .post('/connections/9999/subscription')
        .set('authorization', `Bearer ${token}`);

      // then
      expect(response.status).toEqual(204);
    });

    it('stops after one request when the page is not full', async () => {
      // given
      nock('https://api.github.com')
        .get('/user/installations')
        .query({ per_page: '100', page: '1' })
        .reply(200, { total_count: 1, installations: [installation(5150)] });

      const { token } = await setupUser();

      // when
      const response = await request(server())
        .get('/connections')
        .set('authorization', `Bearer ${token}`);

      // then - a second page request would be an unmatched nock and blow up
      expect(response.status).toEqual(200);
      expect(response.body.connections).toHaveLength(1);
    });
  });

  describe('the installation mirror', () => {
    const mockInstallations = (installations: object[]) =>
      nock('https://api.github.com')
        .get('/user/installations')
        .query(true)
        .reply(200, { total_count: installations.length, installations });

    it('prefers what the webhooks recorded over what the user token happens to return', async () => {
      // given - the webhook has already told us this installation is suspended
      await bootstrap.models.installationModel.create({
        installationId: '5150',
        accountId: '77',
        accountLogin: 'acme-corp',
        accountType: 'Organization',
        repositorySelection: 'all',
        suspendedAt: new Date(),
      });
      mockInstallations([installation(5150, { suspended_at: null })]);
      const { token } = await setupUser();

      // when
      const response = await request(server())
        .get('/connections')
        .set('authorization', `Bearer ${token}`);

      // then - every member of the org reads the same state, and reads it as soon as it changed
      expect(response.body.connections[0].status).toEqual(ConnectionStatus.Suspended);
    });

    it('backfills a row for an installation it has never seen a webhook for', async () => {
      // given - installed before the app's webhook was configured, so the mirror is blind to it
      mockInstallations([installation(5150)]);
      const { token } = await setupUser();

      // when
      await request(server()).get('/connections').set('authorization', `Bearer ${token}`);

      // then
      const stored = await bootstrap.models.installationModel
        .findOne({ installationId: '5150' })
        .lean<any>()
        .exec();
      expect(stored).not.toBeNull();
      expect(stored.accountLogin).toEqual('acme-corp');
    });

    it('still renders an installation the mirror has no row for', async () => {
      // given
      mockInstallations([installation(5150)]);
      const { token } = await setupUser();

      // when
      const response = await request(server())
        .get('/connections')
        .set('authorization', `Bearer ${token}`);

      // then - the live payload is the fallback, so a cold mirror is not an empty page
      expect(response.body.connections).toHaveLength(1);
      expect(response.body.connections[0].accountLogin).toEqual('acme-corp');
    });
  });
});

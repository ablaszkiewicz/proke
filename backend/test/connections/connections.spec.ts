import { generateKeyPairSync } from 'crypto';
import * as nock from 'nock';
import * as request from 'supertest';
import { ConnectionStatus } from '../../src/connections/dto/connection.response';
import {
  ALL_NOTIFICATION_TYPES,
  NotificationType,
} from '../../src/notifications/core/entities/notification-type.enum';
import { RepositoryScope } from '../../src/subscriptions/core/entities/subscription.interface';
import { createTestApp } from '../utils/bootstrap';

describe('Connections', () => {
  let bootstrap: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    // A real key so the app-JWT signing path is exercised rather than stubbed.
    const { privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });

    process.env.GH_APP_SLUG = 'proke-dev';
    process.env.GH_APP_ID = '12345';
    process.env.GH_APP_PRIVATE_KEY = privateKey as string;

    bootstrap = await createTestApp();
  });

  beforeEach(async () => {
    await bootstrap.methods.beforeEach();
  });

  afterAll(async () => {
    await bootstrap.methods.afterAll();
  });

  const acmeInstallation = {
    id: 5150,
    account: { id: 77, login: 'acme-corp', type: 'Organization' },
    repository_selection: 'all',
  };

  const mockUserInstallations = (installations: object[], times = 1) => {
    nock('https://api.github.com')
      .get('/user/installations')
      .query(true)
      .times(times)
      .reply(200, { total_count: installations.length, installations });
  };

  const setupUser = () =>
    bootstrap.utils.authUtils.setupUser({
      githubId: '4242',
      githubLogin: 'ablaszkiewicz',
      githubAccessToken: 'gho_token',
    });

  it('shows an installation a colleague created as available, not on', async () => {
    // given - user B can see the org's installation, but never opted in
    mockUserInstallations([acmeInstallation]);
    const { token } = await setupUser();

    // when
    const response = await request(bootstrap.app.getHttpServer())
      .get('/connections')
      .set('authorization', `Bearer ${token}`);

    // then
    expect(response.status).toEqual(200);
    expect(response.body.connections).toHaveLength(1);
    expect(response.body.connections[0]).toMatchObject({
      installationId: '5150',
      accountLogin: 'acme-corp',
      status: ConnectionStatus.Available,
    });
    expect(response.body.installUrl).toEqual('https://github.com/apps/proke-dev/installations/new');
  });

  it('flips to subscribed once the user opts in', async () => {
    // given - once for the subscribe access check, once for the reload
    mockUserInstallations([acmeInstallation], 2);
    const { token } = await setupUser();

    // when
    const subscribeResponse = await request(bootstrap.app.getHttpServer())
      .post('/connections/5150/subscription')
      .set('authorization', `Bearer ${token}`);

    // then
    expect(subscribeResponse.status).toEqual(204);

    const response = await request(bootstrap.app.getHttpServer())
      .get('/connections')
      .set('authorization', `Bearer ${token}`);
    expect(response.body.connections[0].status).toEqual(ConnectionStatus.Subscribed);
  });

  it('refuses to subscribe to an installation the user cannot access', async () => {
    // given - GitHub says this user can only see 5150
    mockUserInstallations([acmeInstallation]);
    const { token } = await setupUser();

    // when - they ask for somebody else's installation
    const response = await request(bootstrap.app.getHttpServer())
      .post('/connections/9999/subscription')
      .set('authorization', `Bearer ${token}`);

    // then
    expect(response.status).toEqual(403);
    expect(await bootstrap.models.subscriptionModel.countDocuments()).toEqual(0);
  });

  it('unsubscribes', async () => {
    // given
    mockUserInstallations([acmeInstallation], 2);
    const { token, user } = await setupUser();
    await bootstrap.models.subscriptionModel.create({
      userId: user.id,
      installationId: '5150',
    });

    // when
    const response = await request(bootstrap.app.getHttpServer())
      .delete('/connections/5150/subscription')
      .set('authorization', `Bearer ${token}`);

    // then
    expect(response.status).toEqual(204);
    expect(await bootstrap.models.subscriptionModel.countDocuments()).toEqual(0);
  });

  it('subscribing twice is not an error', async () => {
    // given
    mockUserInstallations([acmeInstallation], 2);
    const { token } = await setupUser();

    // when
    await request(bootstrap.app.getHttpServer())
      .post('/connections/5150/subscription')
      .set('authorization', `Bearer ${token}`);
    const second = await request(bootstrap.app.getHttpServer())
      .post('/connections/5150/subscription')
      .set('authorization', `Bearer ${token}`);

    // then
    expect(second.status).toEqual(204);
    expect(await bootstrap.models.subscriptionModel.countDocuments()).toEqual(1);
  });

  it('reports a suspended installation as suspended', async () => {
    // given
    mockUserInstallations([{ ...acmeInstallation, suspended_at: '2026-08-14T12:00:00Z' }]);
    const { token } = await setupUser();

    // when
    const response = await request(bootstrap.app.getHttpServer())
      .get('/connections')
      .set('authorization', `Bearer ${token}`);

    // then
    expect(response.body.connections[0].status).toEqual(ConnectionStatus.Suspended);
  });

  describe('notification preferences', () => {
    it('turning an account on opts into everything', async () => {
      // given
      mockUserInstallations([acmeInstallation], 2);
      const { token } = await setupUser();

      // when
      await request(bootstrap.app.getHttpServer())
        .post('/connections/5150/subscription')
        .set('authorization', `Bearer ${token}`);

      // then - opting in is already the explicit act; six switches afterwards would not be
      const response = await request(bootstrap.app.getHttpServer())
        .get('/connections')
        .set('authorization', `Bearer ${token}`);
      expect(response.body.connections[0].preferences).toEqual({
        repositoryScope: RepositoryScope.All,
        notificationTypes: ALL_NOTIFICATION_TYPES,
        repositories: [],
      });
    });

    it("does not freeze today's list of types onto the subscription", async () => {
      // given
      mockUserInstallations([acmeInstallation], 1);
      const { token, user } = await setupUser();

      // when
      await request(bootstrap.app.getHttpServer())
        .post('/connections/5150/subscription')
        .set('authorization', `Bearer ${token}`);

      // then - storing the list made each new type arrive switched off for everybody who had
      // already subscribed
      const stored = await bootstrap.models.subscriptionModel.findOne({
        userId: user.id,
        installationId: '5150',
      });
      expect(stored?.notificationTypes).toBeUndefined();
    });

    it('reports no preferences for an account that is not on', async () => {
      // given
      mockUserInstallations([acmeInstallation]);
      const { token } = await setupUser();

      // when
      const response = await request(bootstrap.app.getHttpServer())
        .get('/connections')
        .set('authorization', `Bearer ${token}`);

      // then - preferences are what an opt-in contains, so there are none without one
      expect(response.body.connections[0].status).toEqual(ConnectionStatus.Available);
      expect(response.body.connections[0].preferences).toBeUndefined();
    });

    it('stores the full enriched shape the UI does not expose yet', async () => {
      // given
      mockUserInstallations([acmeInstallation], 2);
      const { token, user } = await setupUser();
      await bootstrap.models.subscriptionModel.create({
        userId: user.id,
        installationId: '5150',
      });

      // when - only merges, and only in one repository
      const response = await request(bootstrap.app.getHttpServer())
        .put('/connections/5150/preferences')
        .set('authorization', `Bearer ${token}`)
        .send({
          repositoryScope: RepositoryScope.Selected,
          notificationTypes: [NotificationType.ReviewRequested],
          repositories: [
            {
              repositoryId: '314',
              repositoryFullName: 'acme-corp/api',
              enabled: true,
              notificationTypes: [NotificationType.PullRequestMerged],
            },
          ],
        });

      // then
      expect(response.status).toEqual(200);

      const read = await request(bootstrap.app.getHttpServer())
        .get('/connections')
        .set('authorization', `Bearer ${token}`);
      expect(read.body.connections[0].preferences).toEqual({
        repositoryScope: RepositoryScope.Selected,
        notificationTypes: [NotificationType.ReviewRequested],
        repositories: [
          {
            repositoryId: '314',
            repositoryFullName: 'acme-corp/api',
            enabled: true,
            notificationTypes: [NotificationType.PullRequestMerged],
          },
        ],
      });
    });

    it('keeps an empty type list rather than reading it as "everything"', async () => {
      // given
      mockUserInstallations([acmeInstallation], 2);
      const { token, user } = await setupUser();
      await bootstrap.models.subscriptionModel.create({
        userId: user.id,
        installationId: '5150',
      });

      // when
      await request(bootstrap.app.getHttpServer())
        .put('/connections/5150/preferences')
        .set('authorization', `Bearer ${token}`)
        .send({ repositoryScope: RepositoryScope.All, notificationTypes: [] });

      // then
      const read = await request(bootstrap.app.getHttpServer())
        .get('/connections')
        .set('authorization', `Bearer ${token}`);
      expect(read.body.connections[0].preferences.notificationTypes).toEqual([]);
    });

    it('refuses preferences for an account that is not on', async () => {
      // given - no subscription to attach them to
      const { token } = await setupUser();

      // when
      const response = await request(bootstrap.app.getHttpServer())
        .put('/connections/5150/preferences')
        .set('authorization', `Bearer ${token}`)
        .send({ repositoryScope: RepositoryScope.All, notificationTypes: [] });

      // then
      expect(response.status).toEqual(404);
      expect(await bootstrap.models.subscriptionModel.countDocuments()).toEqual(0);
    });

    it('rejects a notification type it does not know', async () => {
      // given
      const { token, user } = await setupUser();
      await bootstrap.models.subscriptionModel.create({
        userId: user.id,
        installationId: '5150',
      });

      // when
      const response = await request(bootstrap.app.getHttpServer())
        .put('/connections/5150/preferences')
        .set('authorization', `Bearer ${token}`)
        .send({ repositoryScope: RepositoryScope.All, notificationTypes: ['send_me_everything'] });

      // then - an unknown key would silently match nothing, which reads as "you get no pokes"
      expect(response.status).toEqual(400);
    });

    it('does not let one user rewrite another user preferences', async () => {
      // given - both subscribed to the same installation
      const owner = await setupUser();
      const other = await bootstrap.utils.authUtils.setupUser({ githubLogin: 'colleague' });
      await bootstrap.models.subscriptionModel.create({
        userId: owner.user.id,
        installationId: '5150',
      });
      await bootstrap.models.subscriptionModel.create({
        userId: other.user.id,
        installationId: '5150',
      });

      // when
      await request(bootstrap.app.getHttpServer())
        .put('/connections/5150/preferences')
        .set('authorization', `Bearer ${other.token}`)
        .send({ repositoryScope: RepositoryScope.All, notificationTypes: [] });

      // then - preferences are scoped to the caller, not to the installation
      const untouched = await bootstrap.models.subscriptionModel.findOne({
        userId: owner.user.id,
      });
      expect(untouched?.notificationTypes).toBeUndefined();
    });
  });

  describe('uninstall', () => {
    const mockRole = (org: string, role: 'admin' | 'member') => {
      nock('https://api.github.com')
        .get(`/user/memberships/orgs/${org}`)
        .reply(200, { state: 'active', role });
    };

    it('lets an org owner remove the app for everyone', async () => {
      // given
      mockUserInstallations([acmeInstallation]);
      mockRole('acme-corp', 'admin');
      const uninstall = nock('https://api.github.com').delete('/app/installations/5150').reply(204);

      const { token, user } = await setupUser();
      await bootstrap.models.subscriptionModel.create({
        userId: user.id,
        installationId: '5150',
      });
      await bootstrap.models.installationModel.create({
        installationId: '5150',
        accountId: '77',
        accountLogin: 'acme-corp',
        accountType: 'Organization',
        repositorySelection: 'all',
      });

      // when
      const response = await request(bootstrap.app.getHttpServer())
        .delete('/connections/5150')
        .set('authorization', `Bearer ${token}`);

      // then - gone at GitHub, and locally too rather than waiting on the webhook
      expect(response.status).toEqual(204);
      expect(uninstall.isDone()).toBe(true);
      expect(await bootstrap.models.installationModel.countDocuments()).toEqual(0);
      expect(await bootstrap.models.subscriptionModel.countDocuments()).toEqual(0);
    });

    it('refuses a plain org member', async () => {
      // given - can see the installation, is not an owner
      mockUserInstallations([acmeInstallation]);
      mockRole('acme-corp', 'member');
      // No delete interceptor: reaching GitHub at all would be the bug.

      const { token } = await setupUser();

      // when
      const response = await request(bootstrap.app.getHttpServer())
        .delete('/connections/5150')
        .set('authorization', `Bearer ${token}`);

      // then
      expect(response.status).toEqual(403);
      expect(response.body.message).toContain('Only an owner of acme-corp');
    });

    it('refuses when the role cannot be established', async () => {
      // given - e.g. the app lacks the Members permission
      mockUserInstallations([acmeInstallation]);
      nock('https://api.github.com').get('/user/memberships/orgs/acme-corp').reply(403);

      const { token } = await setupUser();

      // when
      const response = await request(bootstrap.app.getHttpServer())
        .delete('/connections/5150')
        .set('authorization', `Bearer ${token}`);

      // then - unknown must fail closed, never open
      expect(response.status).toEqual(403);
    });

    it('refuses an installation the user cannot even see', async () => {
      // given
      mockUserInstallations([acmeInstallation]);
      const { token } = await setupUser();

      // when
      const response = await request(bootstrap.app.getHttpServer())
        .delete('/connections/9999')
        .set('authorization', `Bearer ${token}`);

      // then
      expect(response.status).toEqual(403);
    });

    it('lets a user remove a personal installation without an org check', async () => {
      // given
      mockUserInstallations([
        {
          id: 6100,
          account: { id: 4242, login: 'ablaszkiewicz', type: 'User' },
          repository_selection: 'all',
        },
      ]);
      const uninstall = nock('https://api.github.com').delete('/app/installations/6100').reply(204);

      const { token } = await setupUser();

      // when
      const response = await request(bootstrap.app.getHttpServer())
        .delete('/connections/6100')
        .set('authorization', `Bearer ${token}`);

      // then
      expect(response.status).toEqual(204);
      expect(uninstall.isDone()).toBe(true);
    });

    it('refuses a personal installation belonging to somebody else', async () => {
      // given
      mockUserInstallations([
        {
          id: 6200,
          account: { id: 999, login: 'someone-else', type: 'User' },
          repository_selection: 'all',
        },
      ]);
      const { token } = await setupUser();

      // when
      const response = await request(bootstrap.app.getHttpServer())
        .delete('/connections/6200')
        .set('authorization', `Bearer ${token}`);

      // then
      expect(response.status).toEqual(403);
    });
  });

  it('requires authentication', async () => {
    // when
    const response = await request(bootstrap.app.getHttpServer()).get('/connections');

    // then
    expect(response.status).toEqual(401);
  });
});

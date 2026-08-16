import * as nock from 'nock';
import * as request from 'supertest';
import { AuthMethod } from '../../src/user/core/enum/auth-method.enum';
import { createTestApp } from '../utils/bootstrap';

describe('Auth (github)', () => {
  let bootstrap: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    process.env.GH_APP_CLIENT_ID = 'Iv-test';
    process.env.GH_APP_CLIENT_SECRET = 'test-secret';
    bootstrap = await createTestApp();
  });

  beforeEach(async () => {
    await bootstrap.methods.beforeEach();
  });

  afterAll(async () => {
    await bootstrap.methods.afterAll();
  });

  const mockGithubOauth = (overrides?: {
    githubId?: number;
    login?: string;
    email?: string;
  }) => {
    nock('https://github.com')
      .post('/login/oauth/access_token')
      .query(true)
      .reply(200, { access_token: 'some-token', token_type: 'bearer' });

    nock('https://api.github.com')
      .get('/user')
      .reply(200, {
        id: overrides?.githubId ?? 4242,
        login: overrides?.login ?? 'test-login',
        avatar_url: 'https://some-avatar.com',
      });

    nock('https://api.github.com')
      .get('/user/emails')
      .reply(200, [
        {
          email: 'secondary@test.com',
          primary: false,
          verified: true,
        },
        {
          email: overrides?.email ?? 'primary@test.com',
          primary: true,
          verified: true,
        },
      ]);
  };

  it('logs existing user in', async () => {
    // given
    mockGithubOauth();

    await bootstrap.utils.authUtils.setupUser({
      githubId: '4242',
      email: 'primary@test.com',
    });

    // when
    const loginResponse = await request(bootstrap.app.getHttpServer())
      .post('/auth/github/login')
      .send({
        githubCode: 'whatever',
      });

    // then
    expect(loginResponse.body.token).toBeDefined();
    expect(await bootstrap.models.userModel.countDocuments()).toEqual(1);
  });

  it('matches an existing user by github id even when their email changed', async () => {
    // given
    mockGithubOauth({ githubId: 4242, email: 'brand-new@test.com', login: 'renamed' });

    await bootstrap.utils.authUtils.setupUser({
      githubId: '4242',
      email: 'the-old-one@test.com',
    });

    // when
    const loginResponse = await request(bootstrap.app.getHttpServer())
      .post('/auth/github/login')
      .send({
        githubCode: 'whatever',
      });

    // then - same account, with the changeable fields refreshed
    expect(loginResponse.body.token).toBeDefined();
    expect(await bootstrap.models.userModel.countDocuments()).toEqual(1);
    expect(await bootstrap.models.userModel.findOne()).toMatchObject({
      githubId: '4242',
      githubLogin: 'renamed',
      email: 'brand-new@test.com',
    });
  });

  it('creates a separate account for a different github id on the same email', async () => {
    // given
    mockGithubOauth({ githubId: 9999, email: 'shared@test.com' });

    await bootstrap.utils.authUtils.setupUser({
      githubId: '4242',
      email: 'shared@test.com',
    });

    // when
    const loginResponse = await request(bootstrap.app.getHttpServer())
      .post('/auth/github/login')
      .send({
        githubCode: 'whatever',
      });

    // then
    expect(loginResponse.body.token).toBeDefined();
    expect(await bootstrap.models.userModel.countDocuments()).toEqual(2);
  });

  it('creates new user if not exists', async () => {
    // given
    mockGithubOauth();

    // when
    const loginResponse = await request(bootstrap.app.getHttpServer())
      .post('/auth/github/login')
      .send({
        githubCode: 'whatever',
      });

    // then
    expect(loginResponse.body.token).toBeDefined();
    expect(await bootstrap.models.userModel.findOne()).toMatchObject({
      githubId: '4242',
      githubLogin: 'test-login',
      email: 'primary@test.com',
      authMethod: AuthMethod.Github,
      avatarUrl: 'https://some-avatar.com',
    });
  });


  it('logs a user in even when github will not hand over their email', async () => {
    // given - no "Email addresses" account permission on the app
    nock('https://github.com')
      .post('/login/oauth/access_token')
      .query(true)
      .reply(200, { access_token: 'some-token', token_type: 'bearer' });
    nock('https://api.github.com')
      .get('/user')
      .reply(200, { id: 4242, login: 'test-login', avatar_url: 'https://some-avatar.com' });
    nock('https://api.github.com').get('/user/emails').reply(403);

    // when
    const loginResponse = await request(bootstrap.app.getHttpServer())
      .post('/auth/github/login')
      .send({ githubCode: 'whatever' });

    // then - identity is githubId, so a missing email is not a blocker
    expect(loginResponse.status).toEqual(201);
    expect(loginResponse.body.token).toBeDefined();
    expect(await bootstrap.models.userModel.findOne()).toMatchObject({
      githubId: '4242',
      githubLogin: 'test-login',
    });
  });

  it('rejects a login when the app credentials are not configured', async () => {
    // given
    const previous = process.env.GH_APP_CLIENT_SECRET;
    delete process.env.GH_APP_CLIENT_SECRET;

    try {
      // when
      const loginResponse = await request(bootstrap.app.getHttpServer())
        .post('/auth/github/login')
        .send({ githubCode: 'whatever' });

      // then - says what is actually wrong, rather than relaying github's "Not Found"
      expect(loginResponse.status).toEqual(400);
      expect(loginResponse.body.message).toContain('GH_APP_CLIENT_SECRET');
    } finally {
      process.env.GH_APP_CLIENT_SECRET = previous;
    }
  });

  it('surfaces githubs error instead of treating it as a token', async () => {
    // given - GitHub reports OAuth failures with a 200 and an error body
    nock('https://github.com').post('/login/oauth/access_token').query(true).reply(200, {
      error: 'bad_verification_code',
      error_description: 'The code passed is incorrect or expired.',
    });

    // when
    const loginResponse = await request(bootstrap.app.getHttpServer())
      .post('/auth/github/login')
      .send({
        githubCode: 'expired',
      });

    // then
    expect(loginResponse.status).toEqual(400);
    expect(loginResponse.body.message).toContain('The code passed is incorrect or expired.');
  });
});

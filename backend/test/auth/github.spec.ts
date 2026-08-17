import * as nock from 'nock';
import * as request from 'supertest';
import { ALLOWED_LOGIN_EMAILS } from '../../src/auth/github/github-auth-login.service';
import { AuthMethod } from '../../src/user/core/enum/auth-method.enum';
import { createTestApp } from '../utils/bootstrap';

describe('Auth (github)', () => {
  let bootstrap: Awaited<ReturnType<typeof createTestApp>>;

  // While proke is closed, every login that is meant to succeed has to come from an address on
  // the allowlist. Taken from the constant rather than repeated, so editing the list moves the
  // suite with it instead of turning every happy path red.
  const allowedEmail = ALLOWED_LOGIN_EMAILS[0];

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
          email: overrides?.email ?? allowedEmail,
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
      email: allowedEmail,
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
    mockGithubOauth({ githubId: 4242, email: allowedEmail, login: 'renamed' });

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
      email: allowedEmail,
    });
  });

  it('creates a separate account for a different github id on the same email', async () => {
    // given
    mockGithubOauth({ githubId: 9999, email: allowedEmail });

    await bootstrap.utils.authUtils.setupUser({
      githubId: '4242',
      email: allowedEmail,
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
      email: allowedEmail,
      authMethod: AuthMethod.Github,
      avatarUrl: 'https://some-avatar.com',
    });
  });

  it('rejects a login from an email that is not on the allowlist', async () => {
    // given
    mockGithubOauth({ githubId: 7777, email: 'someone-else@test.com', login: 'a-stranger' });

    // when
    const loginResponse = await request(bootstrap.app.getHttpServer())
      .post('/auth/github/login')
      .send({ githubCode: 'whatever' });

    // then - and no half-made account left behind by the attempt
    expect(loginResponse.status).toEqual(403);
    expect(loginResponse.body.token).toBeUndefined();
    expect(await bootstrap.models.userModel.countDocuments()).toEqual(0);
  });

  it('matches the allowlist regardless of how github cases the address', async () => {
    // given
    mockGithubOauth({ email: allowedEmail.toUpperCase() });

    // when
    const loginResponse = await request(bootstrap.app.getHttpServer())
      .post('/auth/github/login')
      .send({ githubCode: 'whatever' });

    // then
    expect(loginResponse.status).toEqual(201);
    expect(loginResponse.body.token).toBeDefined();
  });

  it('refuses to let an existing user back in once they are off the allowlist', async () => {
    // given - an account made before the list existed
    mockGithubOauth({ githubId: 4242, email: 'grandfathered@test.com' });

    await bootstrap.utils.authUtils.setupUser({
      githubId: '4242',
      email: 'grandfathered@test.com',
    });

    // when
    const loginResponse = await request(bootstrap.app.getHttpServer())
      .post('/auth/github/login')
      .send({ githubCode: 'whatever' });

    // then - the list gates every login, not just the first one
    expect(loginResponse.status).toEqual(403);
    expect(loginResponse.body.token).toBeUndefined();
  });

  it('rejects a login when github will not hand over the email', async () => {
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

    // then - the allowlist fails closed: unreadable is not the same as allowed
    expect(loginResponse.status).toEqual(403);
    expect(await bootstrap.models.userModel.countDocuments()).toEqual(0);
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

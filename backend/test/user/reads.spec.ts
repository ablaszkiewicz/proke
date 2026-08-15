import * as request from 'supertest';
import { createTestApp } from '../utils/bootstrap';

describe('UserCoreController (reads)', () => {
  let bootstrap: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    bootstrap = await createTestApp();
  });

  beforeEach(async () => {
    await bootstrap.methods.beforeEach();
  });

  afterAll(async () => {
    await bootstrap.methods.afterAll();
  });

  it('returns current user if logged in', async () => {
    // given
    const { token } = await bootstrap.utils.authUtils.setupUser({
      email: 'test@test.com',
    });

    // when
    const response = await request(bootstrap.app.getHttpServer())
      .get('/users/me')
      .set('authorization', `Bearer ${token}`);

    // then
    expect(response.body.email).toEqual('test@test.com');
  });

  it('never exposes the stored github access token', async () => {
    // given
    const { token } = await bootstrap.utils.authUtils.setupUser({
      githubAccessToken: 'gho_should_never_be_returned',
    });

    // when
    const response = await request(bootstrap.app.getHttpServer())
      .get('/users/me')
      .set('authorization', `Bearer ${token}`);

    // then
    expect(response.status).toEqual(200);
    expect(JSON.stringify(response.body)).not.toContain('gho_should_never_be_returned');
    expect(response.body.githubAccessToken).toBeUndefined();
  });

  it('returns exception if not logged in', async () => {
    // given
    const token = 'asdf';

    // when
    const response = await request(bootstrap.app.getHttpServer())
      .get('/users/me')
      .set('authorization', `Bearer ${token}`);

    // then
    expect(response.status).toEqual(401);
  });
});

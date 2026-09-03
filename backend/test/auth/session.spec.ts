import * as request from 'supertest';
import { RefreshTokenService } from '../../src/auth/session/refresh-token.service';
import { createTestApp } from '../utils/bootstrap';

describe('Auth (session)', () => {
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

  const server = () => bootstrap.app.getHttpServer();

  it('trades a refresh token for a working access token', async () => {
    // given
    const { refreshToken } = await bootstrap.utils.authUtils.setupUser();

    // when
    const response = await request(server()).post('/auth/refresh').send({ refreshToken });

    // then
    expect(response.status).toEqual(201);
    expect(response.body.expiresIn).toBeGreaterThan(0);

    // and the token it minted opens a guarded route, which is the only claim worth making
    // about it - a string that is not accepted anywhere is not an access token.
    const meResponse = await request(server())
      .get('/users/me')
      .set('Authorization', `Bearer ${response.body.token}`);

    expect(meResponse.status).toEqual(200);
  });

  it('hands the same refresh token back, so a second tab is not signed out by the first', async () => {
    // given
    const { refreshToken } = await bootstrap.utils.authUtils.setupUser();

    // when - two refreshes with the one token, the way two open tabs would do it
    const first = await request(server()).post('/auth/refresh').send({ refreshToken });
    const second = await request(server()).post('/auth/refresh').send({ refreshToken });

    // then - not rotated, and still spendable. See RefreshTokenService.redeem.
    expect(first.body.refreshToken).toEqual(refreshToken);
    expect(second.status).toEqual(201);
    expect(second.body.token).toBeDefined();
  });

  it('pushes the expiry out on every use, so an active session never lapses', async () => {
    // given
    const { refreshToken } = await bootstrap.utils.authUtils.setupUser();
    const issued = await bootstrap.models.refreshTokenModel.findOne().lean();

    // when
    await new Promise((resolve) => setTimeout(resolve, 10));
    await request(server()).post('/auth/refresh').send({ refreshToken });

    // then
    const afterUse = await bootstrap.models.refreshTokenModel.findOne().lean();
    expect(afterUse!.expiresAt.getTime()).toBeGreaterThan(issued!.expiresAt.getTime());
  });

  it('refuses a refresh token it has never seen', async () => {
    // when
    const response = await request(server())
      .post('/auth/refresh')
      .send({ refreshToken: 'not-a-token-anybody-issued' });

    // then - 401, so the client treats it the way it treats every other dead credential
    expect(response.status).toEqual(401);
  });

  it('refuses one that has lapsed', async () => {
    // given - a session whose expiry has been walked back into the past. The TTL index sweeps on
    // its own schedule, so the row is still there and the check has to be the one doing the work.
    const { refreshToken } = await bootstrap.utils.authUtils.setupUser();

    await bootstrap.models.refreshTokenModel.updateOne(
      {},
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );

    // when
    const response = await request(server()).post('/auth/refresh').send({ refreshToken });

    // then
    expect(response.status).toEqual(401);
  });

  it('stores only a hash of the refresh token', async () => {
    // given
    const { refreshToken } = await bootstrap.utils.authUtils.setupUser();

    // when
    const stored = await bootstrap.models.refreshTokenModel.findOne().lean();

    // then - a dump of this collection is a list of hashes, not a drawer of live sessions
    expect(stored!.tokenHash).not.toEqual(refreshToken);
    expect(stored!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('ends the session on logout', async () => {
    // given
    const { refreshToken } = await bootstrap.utils.authUtils.setupUser();

    // when
    const logoutResponse = await request(server()).post('/auth/logout').send({ refreshToken });

    // then
    expect(logoutResponse.status).toEqual(204);

    const refreshResponse = await request(server()).post('/auth/refresh').send({ refreshToken });
    expect(refreshResponse.status).toEqual(401);
    expect(await bootstrap.models.refreshTokenModel.countDocuments()).toEqual(0);
  });

  it('leaves other devices signed in when one logs out', async () => {
    // given - one account, two sessions, the way two browsers would leave it
    const { user, refreshToken } = await bootstrap.utils.authUtils.setupUser();
    const otherDevice = await bootstrap.app.get(RefreshTokenService).issue(user.id);

    // when
    await request(server()).post('/auth/logout').send({ refreshToken });

    // then
    const refreshResponse = await request(server())
      .post('/auth/refresh')
      .send({ refreshToken: otherDevice.token });

    expect(refreshResponse.status).toEqual(201);
  });

  it('says nothing about a token it does not hold', async () => {
    // when - signing out twice, which is what a client retrying its best-effort call does
    const response = await request(server())
      .post('/auth/logout')
      .send({ refreshToken: 'never-existed' });

    // then - 204 either way, so an unauthenticated caller learns nothing from the status
    expect(response.status).toEqual(204);
  });

  it('ends every session when the account is deleted', async () => {
    // given
    const { token, user, refreshToken } = await bootstrap.utils.authUtils.setupUser();
    await bootstrap.app.get(RefreshTokenService).issue(user.id);

    // when
    const deleteResponse = await request(server())
      .delete('/users/me')
      .set('Authorization', `Bearer ${token}`);

    // then - nothing left to renew with, so the deleted account outlives its own deletion by at
    // most one access token rather than by a month of refreshes
    expect(deleteResponse.status).toEqual(204);
    expect(await bootstrap.models.refreshTokenModel.countDocuments()).toEqual(0);

    const refreshResponse = await request(server()).post('/auth/refresh').send({ refreshToken });
    expect(refreshResponse.status).toEqual(401);
  });

  it('rejects a refresh with no token in it', async () => {
    // when
    const response = await request(server()).post('/auth/refresh').send({});

    // then
    expect(response.status).toEqual(400);
  });
});

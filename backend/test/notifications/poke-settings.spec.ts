import * as request from 'supertest';
import {
  ALL_NOTIFICATION_TYPES,
  NotificationType,
} from '../../src/notifications/core/entities/notification-type.enum';
import { createTestApp } from '../utils/bootstrap';

/**
 * The account-wide half of what pokes somebody: which kinds they have switched off, everywhere.
 *
 * The delivery consequences live in the webhook spec, where there is an event to send. These are
 * about the settings themselves - what is stored, what comes back, and what an account that has
 * never touched them answers.
 */
describe('Poke settings', () => {
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

  const update = (token: string, mutedTypes: unknown) =>
    request(bootstrap.app.getHttpServer())
      .put('/notifications/settings')
      .set('authorization', `Bearer ${token}`)
      .send({ mutedTypes });

  const readProfile = (token: string) =>
    request(bootstrap.app.getHttpServer())
      .get('/users/me')
      .set('authorization', `Bearer ${token}`);

  it('says nothing is muted for an account that has never touched the settings', async () => {
    // given
    const { token } = await bootstrap.utils.authUtils.setupUser({ githubId: '4242' });

    // when
    const response = await readProfile(token);

    // then - the whole point of storing the noes: an untouched account is on for everything,
    // including kinds that did not exist when it was created.
    expect(response.status).toEqual(200);
    expect(response.body.pokeSettings).toEqual({ mutedTypes: [] });
  });

  it('stores what was switched off and hands it back on the profile', async () => {
    // given
    const { token } = await bootstrap.utils.authUtils.setupUser({ githubId: '4242' });

    // when
    const saved = await update(token, [
      NotificationType.IssueComment,
      NotificationType.AutoMergeEnabled,
    ]);

    // then
    expect(saved.status).toEqual(200);
    expect(saved.body.mutedTypes.sort()).toEqual(
      [NotificationType.AutoMergeEnabled, NotificationType.IssueComment].sort(),
    );

    // and - the dashboard reads these off the profile rather than asking for them
    const profile = await readProfile(token);
    expect(profile.body.pokeSettings.mutedTypes.sort()).toEqual(saved.body.mutedTypes.sort());
  });

  it('unmutes by leaving the type out, rather than by any switch of its own', async () => {
    // given
    const { token } = await bootstrap.utils.authUtils.setupUser({ githubId: '4242' });
    await update(token, [NotificationType.IssueComment, NotificationType.IssueMention]);

    // when - the whole set every time, which is what makes the removal legible
    const response = await update(token, [NotificationType.IssueMention]);

    // then
    expect(response.body.mutedTypes).toEqual([NotificationType.IssueMention]);
  });

  it('drops a retired type rather than letting it mute anything', async () => {
    // given - a row written when team mentions were a kind of their own
    const { user, token } = await bootstrap.utils.authUtils.setupUser({ githubId: '4242' });
    await bootstrap.models.userModel.updateOne(
      { _id: user.id },
      { $set: { pokeSettings: { mutedTypes: ['team_mention', NotificationType.IssueComment] } } },
    );

    // when
    const response = await readProfile(token);

    // then - retiring a type costs no migration precisely because of this
    expect(response.body.pokeSettings.mutedTypes).toEqual([NotificationType.IssueComment]);
  });

  it('refuses a type it does not know', async () => {
    // given
    const { token } = await bootstrap.utils.authUtils.setupUser({ githubId: '4242' });

    // when
    const response = await update(token, ['team_mention']);

    // then - a 400 rather than a silent no-op, which is the more useful answer to a stale client
    expect(response.status).toEqual(400);
  });

  it('accepts every kind at once, which is how nothing at all is spelled', async () => {
    // given
    const { token } = await bootstrap.utils.authUtils.setupUser({ githubId: '4242' });

    // when
    const response = await update(token, ALL_NOTIFICATION_TYPES);

    // then
    expect(response.status).toEqual(200);
    expect(response.body.mutedTypes.sort()).toEqual([...ALL_NOTIFICATION_TYPES].sort());
  });

  it('needs a session', async () => {
    // when
    const response = await update('not-a-token', [NotificationType.IssueComment]);

    // then
    expect(response.status).toEqual(401);
  });
});

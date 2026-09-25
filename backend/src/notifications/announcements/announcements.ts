import { Announcement } from './announcement.interface';

/**
 * Every announcement proke has ever sent, oldest first. Migrations, but for Slack messages.
 *
 * On every start, each one is sent once to everybody who had Slack connected when it first went
 * out - including anybody a previous start did not reach yet. Somebody who connects afterwards
 * does not get it: they are shown the product as it is, not told what changed.
 *
 * To send one, append it here and deploy. The rest follows from the messages being unsendable:
 *
 *  - Append only. Never edit, reorder or remove an entry that has been deployed. It has already
 *    been sent as it was, and a changed id is a brand new announcement that goes out again.
 *  - Delivery is at most once. A failed send is recorded, not retried; the rows in
 *    `announcement-deliveries` say who got what.
 */
export const ANNOUNCEMENTS: readonly Announcement[] = [
  {
    id: '2026-09-25-daily-digest',
    text: 'New in proke: a daily digest of every pull request still waiting on your review.',
    body:
      '*New: a daily digest.* Once a day, at an hour you choose, proke sends you one message ' +
      'listing every pull request still waiting on your review, oldest first.\n' +
      'It is off until you turn it on.',
    buttons: [{ label: 'Configure it', url: '/app' }],
  },
];

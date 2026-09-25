/**
 * A message from us rather than from GitHub, sent once to everybody who had Slack connected when
 * it first went out. The list lives in announcements.ts; AnnouncementService sends it.
 */
export interface Announcement {
  /**
   * `YYYY-MM-DD-slug`, and permanent. Who has already had it is recorded against this, so a
   * changed id is a new announcement and goes out to everybody a second time.
   */
  id: string;
  /**
   * Plain text: what the notification banner and the sidebar preview show, and neither renders
   * any markup. It has to carry the point on its own.
   */
  text: string;
  /** Slack mrkdwn, the message itself. Absent means `text` is the message too. */
  body?: string;
  /** A row of link buttons under the message. */
  buttons?: AnnouncementButton[];
}

export interface AnnouncementButton {
  label: string;
  /**
   * Absolute, or a path in the frontend such as `/app`, which is resolved against APP_URL - so
   * the same announcement opens the local app on a local run and the real one in production.
   */
  url: string;
}

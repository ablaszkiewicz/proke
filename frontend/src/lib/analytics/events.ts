/**
 * Every event the browser sends, without its prefix.
 *
 * The `frontend_` prefix is applied once, in analytics.ts. Keeping it out of these values means
 * a name can never be half-prefixed, and it lets each event sit next to its backend counterpart
 * in backend/src/analytics/analytics-events.ts and obviously be the same funnel.
 *
 * The rule for what belongs here: **the browser only reports what the server cannot see.**
 * A `frontend_slack_connect_succeeded` next to a `backend_slack_linked` would not be a second
 * data point, it would be a worse copy of the same one - same moment, same person, but lost to
 * every ad blocker, which for an audience of developers is a large and non-random slice. So
 * there are no paired outcome events. There are only two kinds of event in this list:
 *
 * - `*_clicked` - intent. The server never sees a click that did not become a request, and
 *   someone who presses "Connect Slack", lands on Slack's authorize page and closes the tab is
 *   invisible without this. That gap is the funnel.
 *
 * - `*_returned` - what happened at GitHub or Slack, on the way back. When either of them turns
 *   a user away, proke's backend is not called at all: there is no webhook and no API for "they
 *   cancelled", "Slack wants an admin to approve first" or "a GitHub org owner has to approve
 *   this install". The browser is the only thing that ever knows.
 *
 * Everything else - every outcome - is a backend event.
 */
export type AnalyticsEvent =
  | 'github_login_clicked'
  | 'github_login_returned'
  | 'org_install_clicked'
  | 'org_install_returned'
  | 'org_subscribe_clicked'
  | 'org_unsubscribe_clicked'
  | 'org_uninstall_clicked'
  | 'slack_connect_clicked'
  | 'slack_install_clicked'
  | 'slack_disconnect_clicked'
  | 'slack_test_poke_clicked'
  | 'slack_returned';

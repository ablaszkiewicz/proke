/**
 * Every event the backend sends, without its prefix.
 *
 * The `backend_` prefix is applied once, in AnalyticsService, rather than written into these
 * values. Two reasons: a name can never be half-prefixed, and the pair of an event and its
 * frontend counterpart stays readable side by side - `github_login_succeeded` here and
 * `github_login_clicked` in frontend/src/lib/analytics/events.ts are obviously the same funnel.
 *
 * A union rather than an enum so the names read as themselves at the call site and a typo is a
 * compile error rather than a second event nobody notices for a month.
 */
export type AnalyticsEvent =
  // Sign-in.
  | 'github_login_succeeded'

  // Organisations. `installed` and `removed` arrive from GitHub's webhook rather than from a
  // request, so they are the only ones here that can land with nobody signed in.
  | 'org_installed'
  | 'org_removed'
  | 'org_subscribed'
  | 'org_subscribe_failed'
  | 'org_unsubscribed'
  | 'org_uninstalled'
  | 'org_uninstall_failed'

  // Slack. Linking an identity and installing the app are separate authorizations that can
  // happen days apart, so they are separate events even though one round trip can do both.
  | 'slack_linked'
  | 'slack_connect_failed'
  | 'slack_workspace_installed'
  | 'slack_disconnected'
  | 'slack_workspace_revoked'

  /*
   * Pokes. Both fire only when proke actually spoke to Slack, so between them they count
   * attempts and nothing else.
   *
   * There is deliberately no event for a poke that had nowhere to go - somebody who has not
   * connected Slack, or a workspace proke was never added to. Those repeat at the rate the
   * person's repositories are busy while saying the same thing every time, and the thing they
   * say is already answerable from whether that person has a slack_linked event at all.
   */
  | 'poke_sent'
  | 'poke_failed'
  /*
   * A review request poke struck through because the pull request moved past it. Only fires
   * once Slack has confirmed the edit, so it counts messages that actually changed rather than
   * events that should have changed one.
   */
  | 'poke_resolved'
  | 'account_deleted';

/**
 * What a poke was about, for the `poke_type` property.
 *
 * Wider than NotificationType because not every Slack message proke sends is a notification:
 * the dashboard's test button and the message that proves a fresh connection works both go out
 * the same pipe, and both are worth telling apart from a real poke rather than hiding.
 */
export type PokeTrigger = 'github_webhook' | 'test' | 'welcome';

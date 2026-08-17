/**
 * What a poke looks like where it lands: in Slack, from proke, as a direct message.
 *
 * These mirror `buildPokeMessage` on the backend line for line - the same leads ("requested your
 * review on", "merged", "mentioned you on"), the same ✅/❌ markers on a submitted review, the
 * repository underneath. If that file's wording changes, this one is what has gone stale.
 *
 * Every card is deliberately the same shape and therefore the same height: the reel that stacks
 * them scrolls by whole rows and would drift if one of them were taller. That is also why the
 * message is one truncating line rather than a real Slack quote block.
 */

export interface PokePreview {
  /** Only a submitted review carries one, exactly as the message builder does it. */
  marker?: string;
  actor: string;
  /** The lead, minus the actor - "merged", "commented on", "requested your review on". */
  lead: string;
  subject: string;
  repository: string;
}

export function PokeCard({ preview }: { preview: PokePreview }) {
  return (
    <div className="flex w-full items-start gap-2.5 rounded-xl border bg-card/40 p-3.5 text-left">
      {/*
        The app icon itself, not an impression of one - it is the same file Slack is given and
        renders beside a real poke, so the mock cannot drift from what people actually see.
      */}
      <img
        src="/proke-p.svg"
        alt=""
        width={24}
        height={24}
        className="mt-0.5 size-6 shrink-0 rounded"
      />

      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="flex items-center gap-1.5 text-xs font-medium">
          proke
          <span className="rounded bg-muted px-1 py-px text-[9px] font-normal uppercase tracking-wider text-muted-foreground">
            App
          </span>
        </p>

        {/*
          One line, always. In a wide card it is the whole sentence; in the dashboard's narrow
          column it ellipsises, which is what Slack itself does at that width - and either way
          the card is the same height, which the reel depends on.
        */}
        <p className="truncate text-[11px] leading-relaxed text-muted-foreground sm:text-xs">
          {preview.marker ? `${preview.marker} ` : null}
          <span className="text-foreground">@{preview.actor}</span>{" "}
          {preview.lead} <span className="text-blue-400">{preview.subject}</span>
        </p>

        <p className="truncate text-[10px] text-muted-foreground/60">
          {preview.repository}
        </p>
      </div>
    </div>
  );
}

/**
 * One per notification type, in the same order as NOTIFICATION_TYPES - the dashboard's list
 * hands the reel a row index straight off that list, so the two orders have to stay level.
 */
export const POKE_PREVIEWS: PokePreview[] = [
  {
    actor: "ada",
    lead: "requested your review on",
    subject: "Fix flaky uploads #482",
    repository: "acme/api",
  },
  {
    marker: "✅",
    actor: "ada",
    lead: "approved",
    subject: "Retry uploads with backoff #489",
    repository: "acme/api",
  },
  {
    actor: "rob",
    lead: "merged",
    subject: "Cache the org list #498",
    repository: "acme/api",
  },
  {
    actor: "rob",
    lead: "commented on",
    subject: "Fix flaky uploads #482",
    repository: "acme/api",
  },
  {
    actor: "nina",
    lead: "mentioned you on",
    subject: "Drop the legacy uploader #501",
    repository: "acme/api",
  },
  {
    actor: "nina",
    lead: "mentioned you on",
    subject: "Uploads time out over 50MB #77",
    repository: "acme/web",
  },
  {
    actor: "rob",
    lead: "mentioned @acme/reviewers on",
    subject: "Drop the legacy uploader #501",
    repository: "acme/api",
  },
];

/**
 * The run-up. Pokes stacked above the real six purely so the reel has something to fly through
 * on its way in - they go past blurred and are never landed on, which is why they can be any
 * plausible poke at all.
 */
export const POKE_INTRO_PREVIEWS: PokePreview[] = [
  {
    actor: "sam",
    lead: "requested your review on",
    subject: "Bump pnpm to 10.15 #503",
    repository: "acme/api",
  },
  {
    marker: "❌",
    actor: "lee",
    lead: "requested changes on",
    subject: "Split the router #495",
    repository: "acme/api",
  },
  {
    actor: "kit",
    lead: "merged",
    subject: "Trim the webhook payload #492",
    repository: "acme/web",
  },
  {
    actor: "sam",
    lead: "commented on",
    subject: "Add a health endpoint #488",
    repository: "acme/api",
  },
  {
    actor: "lee",
    lead: "mentioned you on",
    subject: "Flaky e2e on CI #486",
    repository: "acme/web",
  },
  {
    marker: "✅",
    actor: "kit",
    lead: "approved",
    subject: "Move the queue off cron #484",
    repository: "acme/api",
  },
  {
    actor: "ada",
    lead: "merged",
    subject: "Send pokes as blocks #479",
    repository: "acme/api",
  },
  {
    actor: "nina",
    lead: "requested your review on",
    subject: "Rate limit the webhook #476",
    repository: "acme/web",
  },
  {
    actor: "rob",
    lead: "commented on",
    subject: "Keep the DM channel cached #471",
    repository: "acme/api",
  },
  {
    actor: "sam",
    lead: "mentioned you on",
    subject: "Slack install needs an owner #68",
    repository: "acme/web",
  },
  {
    marker: "❌",
    actor: "ada",
    lead: "requested changes on",
    subject: "Drop the polling worker #465",
    repository: "acme/api",
  },
  {
    actor: "kit",
    lead: "merged",
    subject: "Encrypt bot tokens at rest #461",
    repository: "acme/api",
  },
];

import { InboxPage } from "@/components/inbox/InboxPage";
import {
  DEFAULT_INBOX_FILTERS,
  type InboxFilterKey,
  type InboxFilters,
} from "@/lib/api/inbox.api";
import { useMemo, useState } from "react";
import { classifyMockInbox, MOCK_TEAMS } from "./mockInbox";

/**
 * The inbox, on rows that never existed.
 *
 * ## What it is for
 *
 * Trying the settings out. Every one of them is a decision about how a pile of pull requests is
 * cut up, and the only honest way to judge one is to move it and watch rows go somewhere else.
 * Against the real inbox that means owning the right pull requests on the right day; against
 * this it means opening a page. It also works with no server running at all, which is the other
 * half of what makes it worth keeping.
 *
 * ## Why it renders the real page rather than something that looks like it
 *
 * Because a second copy of the page is a second copy to drift. An earlier version of this file
 * had one, and within an hour it had drifted on three separate numbers - where the content stops
 * being centred, the gutter between the columns, and how far in from the edge the header sits.
 * All three read as "something is subtly off" and none of them is findable by looking.
 *
 * So the page is the page, and the drawer is the drawer. All this holds is the fixture and the
 * settings it is being shown under.
 *
 * ## What is local to it
 *
 * The filters are `useState` rather than the address bar, and the rows are classified in the
 * browser - see mockInbox.ts, which says at length why neither of those is allowed anywhere near
 * the real thing.
 */
export function MockInboxPage() {
  const [filters, setFilters] = useState<InboxFilters>(DEFAULT_INBOX_FILTERS);

  const { yours, waitingOnYou } = useMemo(
    () => classifyMockInbox(filters),
    [filters]
  );

  return (
    <InboxPage
      yours={yours}
      waitingOnYou={waitingOnYou}
      refreshing={false}
      stale={false}
      settled
      hasAnswer
      githubReauthRequired={false}
      filters={filters}
      teams={MOCK_TEAMS}
      onFilterChange={<Key extends InboxFilterKey>(
        key: Key,
        value: InboxFilters[Key]
      ) => setFilters((was) => ({ ...was, [key]: value }))}
    />
  );
}

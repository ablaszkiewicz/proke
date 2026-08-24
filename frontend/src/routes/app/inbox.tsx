import { Inbox } from "@/components/inbox/Inbox";
import {
  inboxFiltersFromSearch,
  inboxSearchFromFilters,
  normalizeInboxSearch,
  type InboxSearch,
} from "@/components/inbox/search";
import type { InboxFilterKey, InboxFilters } from "@/lib/api/inbox.api";
import { authLogic } from "@/lib/logics/authLogic";
import {
  createFileRoute,
  Navigate,
  useNavigate,
  type SearchSchemaInput,
} from "@tanstack/react-router";
import { useValues } from "kea";
import { useMemo } from "react";

/**
 * The review inbox. Behind a session like everything else under `/app`.
 *
 * The settings live on this route's query string and nowhere else - not in local storage, not on
 * the account. See components/inbox/search.ts for why, and for the rule that keeps the address
 * bar empty until something is actually set.
 *
 * ## What `validateSearch` is for here, which is not what it looks like
 *
 * It is not a parser feeding the page. TanStack runs it on every navigation and writes **its
 * return value** into the address bar, so what it returns is what the URL becomes - and that is
 * then handed back to it on the next load. It is a canonicaliser, and the shape it returns has
 * to be the shape a URL can hold.
 *
 * So it returns the query string's own shape and the component turns that into filters. Having
 * it return the useful shape instead - complete `InboxFilters`, lists as real arrays - is what
 * put `excludedTeams=["posthog/core"]` and every default into the address bar, and then failed
 * to read them back out.
 *
 * Nothing is rewritten on arrival: a navigation is what writes, and opening a link is not one.
 * So a bookmark stays exactly as somebody made it until they touch a switch, and is tidied then.
 */
export const Route = createFileRoute("/app/inbox")({
  // The parameter type is what links and `navigate` calls are checked against, and the return
  // type is what `useSearch` gives back. Both are the query string's shape here; what makes them
  // worth telling apart is `SearchSchemaInput`, which lets a caller pass fewer than all of them.
  validateSearch: (search: InboxSearch & SearchSchemaInput): InboxSearch =>
    normalizeInboxSearch(search),
  component: InboxTanstackPage,
});

function InboxTanstackPage() {
  // The token is read from local storage as the logic mounts, so this is decided on the first
  // render rather than after a flash of the page.
  const { isLoggedIn } = useValues(authLogic);
  const search = Route.useSearch();
  const navigate = useNavigate();

  // Memoised against the search rather than worked out per render, because the identity of this
  // is what tells the page a setting actually moved - see Inbox. The router hands back the same
  // search object until the location changes, so this changes exactly when the settings do.
  const filters = useMemo(() => inboxFiltersFromSearch(search), [search]);

  if (!isLoggedIn) {
    return <Navigate to="/" replace />;
  }

  return (
    <Inbox
      filters={filters}
      onFilterChange={<Key extends InboxFilterKey>(
        key: Key,
        value: InboxFilters[Key]
      ) =>
        navigate({
          to: "/app/inbox",
          // The whole set is worked out and then stripped back to what differs from the
          // defaults, rather than the previous query string being amended: a setting put back
          // to its default has to leave the address bar, and amending would leave it sitting
          // there saying nothing.
          search: inboxSearchFromFilters({ ...filters, [key]: value }),
          // A filter is not a place, so it does not get a place in the history. Twelve presses
          // while reading should not be twelve entries between here and wherever somebody came
          // from - and a bookmark takes the address bar as it stands either way.
          replace: true,
        })
      }
    />
  );
}

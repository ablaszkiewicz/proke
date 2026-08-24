import { Inbox } from "@/components/inbox/Inbox";
import {
  inboxFiltersFromSearch,
  inboxSearchFromFilters,
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

/**
 * The review inbox. Behind a session like everything else under `/app`.
 *
 * The settings live on this route's query string and nowhere else - not in local storage, not on
 * the account. See components/inbox/search.ts for why, and for the rule that keeps the address
 * bar empty until something is actually set.
 *
 * `validateSearch` reads them; it never writes. The address bar is left exactly as somebody typed
 * or bookmarked it until a switch is pressed, so opening `/app/inbox` does not silently grow a
 * query string full of today's defaults.
 */
export const Route = createFileRoute("/app/inbox")({
  // The parameter type is what links and `navigate` calls are checked against, and the return
  // type is what `useSearch` gives back - which is why the first is partial and the second is
  // complete. `SearchSchemaInput` is what tells the router to tell those two apart.
  validateSearch: (search: InboxSearch & SearchSchemaInput): InboxFilters =>
    inboxFiltersFromSearch(search),
  component: InboxTanstackPage,
});

function InboxTanstackPage() {
  // The token is read from local storage as the logic mounts, so this is decided on the first
  // render rather than after a flash of the page.
  const { isLoggedIn } = useValues(authLogic);
  const filters = Route.useSearch();
  const navigate = useNavigate();

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

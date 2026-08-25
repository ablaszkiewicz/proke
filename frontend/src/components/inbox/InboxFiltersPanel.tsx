import type {
  InboxFilterChange,
  InboxFilters,
  InboxTeam,
} from "@/lib/api/inbox.api";
import { Fragment } from "react";
import {
  AuthorsFilter,
  SwitchFilter,
  TeamsFilter,
  WindowFilter,
} from "./FilterControls";
import { DrawerHeader } from "./InboxDrawer";
import { INBOX_FILTER_OPTIONS, type InboxFilterOption } from "./filters";

/**
 * What the inbox is showing, and the one place on this page that changes it.
 *
 * ## Why a drawer rather than the popover this replaced
 *
 * Because every setting in here is a claim about where the rows behind it end up, and the only
 * way to judge one is to move it and watch. A popover covered the right-hand column - half of
 * the thing it was about - so changing a filter meant pressing, reading, and pressing again to
 * see what happened. A drawer takes the space instead of borrowing it: everything stays visible,
 * narrower, and a switch and its consequence are on screen at the same moment.
 *
 * It also stopped being a panel of two switches. Five settings, one of which lists your GitHub
 * teams and one of which is a field you type into, is not a thing to hang off a button in a
 * corner.
 *
 * ## Why this is only the contents
 *
 * The aside around it is InboxDrawer. See there for everything about how the drawer behaves;
 * nothing in this file knows.
 *
 * ## What is deliberately absent
 *
 * A Save, a Cancel, and a count of what is hidden. The first two because every toggle takes
 * effect immediately - the rows change under the open drawer, and there is nothing to confirm.
 * The third because it reads as a warning about a thing the reader chose, and it would need the
 * server to count rows it was asked not to send.
 */
export function InboxFiltersPanel({
  onClose,
  filters,
  teams,
  teamsAsked,
  onChange,
}: {
  onClose: () => void;
  filters: InboxFilters;
  /** See InboxPage. Undefined is "not established yet", which the panel says rather than draws. */
  teams?: InboxTeam[];
  teamsAsked: boolean;
  /** Applied immediately. There is nothing to confirm. */
  onChange: InboxFilterChange;
}) {
  return (
    <>
      <DrawerHeader
        title="Filters"
        // Not a disclaimer. A setting made here is on the account from the moment it is made,
        // and the reader is owed that fact *before* they find it out: the section they hid on a
        // Tuesday is still hidden the following month, on another machine, with nothing on the
        // page saying why. One sentence, so nobody has to wonder where the save button is.
        note="Saved to your account, so what you set here stays set."
        onClose={onClose}
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-4 pt-1.5">
        {INBOX_FILTER_OPTIONS.map((option, index) => (
          <Fragment key={option.key}>
            {/*
              A hairline between settings, and only between them - never above the first or
              below the last, where it would be a second border inside the drawer's own.

              It is here because two of these controls open into something underneath them,
              and without a line it is genuinely unclear whether a row of spans belongs to
              the setting above it or the one below. At `border/60` it is barely a mark:
              enough to group, not enough to be a feature.
            */}
            {index > 0 ? (
              <div aria-hidden="true" className="mx-2.5 my-1 h-px bg-border/60" />
            ) : null}

            <Setting
              option={option}
              filters={filters}
              teams={teams}
              teamsAsked={teamsAsked}
              onChange={onChange}
            />
          </Fragment>
        ))}
      </div>
    </>
  );
}

/** One setting, drawn as whatever kind it is. */
function Setting({
  option,
  filters,
  teams,
  teamsAsked,
  onChange,
}: {
  option: InboxFilterOption;
  filters: InboxFilters;
  teams?: InboxTeam[];
  teamsAsked: boolean;
  onChange: InboxFilterChange;
}) {
  switch (option.kind) {
    case "window":
      return (
        <WindowFilter
          option={option}
          value={filters[option.key]}
          onChange={onChange}
        />
      );
    case "teams":
      return (
        <TeamsFilter
          option={option}
          on={filters[option.key]}
          excluded={filters[option.membersKey]}
          teams={teams}
          asked={teamsAsked}
          onChange={onChange}
        />
      );
    case "authors":
      return (
        <AuthorsFilter
          option={option}
          authors={filters[option.key]}
          onChange={onChange}
        />
      );
    default:
      return (
        <SwitchFilter option={option} filters={filters} onChange={onChange} />
      );
  }
}

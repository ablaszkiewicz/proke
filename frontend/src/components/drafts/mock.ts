/**
 * Stand-in data for the dashboard drafts. Deliberately not wired to the API - the drafts are
 * about layout, and a fixed set of rows keeps five of them comparable.
 */
export type OrgStatus = "subscribed" | "available" | "suspended";

export interface MockOrg {
  id: string;
  login: string;
  type: "User" | "Organization";
  status: OrgStatus;
  scope: "all" | "selected";
  /** How many of the account's repositories this user reaches - not how many it has. */
  repos: number;
  /** What this user is to the account. Undefined stands in for "GitHub would not say". */
  role?: "owner" | "member";
}

export const MOCK_USER = {
  login: "ablaszkiewicz",
  avatarUrl: "https://github.com/ablaszkiewicz.png?size=96",
};

export const MOCK_ORGS: MockOrg[] = [
  {
    id: "5150",
    login: "cryptly-dev",
    type: "Organization",
    status: "subscribed",
    scope: "all",
    repos: 12,
    role: "owner",
  },
  {
    id: "5151",
    login: "logdash-io",
    type: "Organization",
    status: "subscribed",
    scope: "selected",
    repos: 4,
    role: "member",
  },
  {
    id: "5152",
    login: "ablaszkiewicz",
    type: "User",
    status: "available",
    scope: "all",
    repos: 21,
    role: "owner",
  },
  // The row this all exists for: somebody else's profile, one repository of it shared with you.
  // The installation still reports "all", because that is what its owner granted.
  {
    id: "5153",
    login: "hugues",
    type: "User",
    status: "subscribed",
    scope: "all",
    repos: 1,
    role: "member",
  },
  {
    id: "5154",
    login: "corelabsltd",
    type: "Organization",
    status: "suspended",
    scope: "all",
    repos: 3,
    role: "member",
  },
];

export const MOCK_SLACK = { connected: false };

export function statusText(org: MockOrg): string {
  switch (org.status) {
    case "subscribed":
      return org.scope === "selected" ? "On · selected repos" : "On · all repos";
    case "available":
      return "Not on";
    case "suspended":
      return "Suspended on GitHub";
  }
}

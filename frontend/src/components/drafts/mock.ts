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
  repos: number;
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
  },
  {
    id: "5151",
    login: "logdash-io",
    type: "Organization",
    status: "subscribed",
    scope: "selected",
    repos: 4,
  },
  {
    id: "5152",
    login: "ablaszkiewicz",
    type: "User",
    status: "available",
    scope: "all",
    repos: 21,
  },
  {
    id: "5153",
    login: "corelabsltd",
    type: "Organization",
    status: "suspended",
    scope: "all",
    repos: 3,
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

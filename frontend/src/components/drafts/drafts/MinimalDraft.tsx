import { DashboardPage } from "@/components/dashboard/DashboardPage";
import type { Connection } from "@/lib/api/connections.api";
import { MOCK_ORGS, MOCK_USER } from "../mock";

const REPO_NAMES = ["api", "web", "infra", "docs", "cli", "sdk", "jobs", "www"];

const CONNECTIONS: Connection[] = MOCK_ORGS.map((org) => ({
  installationId: org.id,
  accountLogin: org.login,
  accountType: org.type,
  status: org.status,
  repositorySelection: org.scope,
  viewerRole: org.role,
  repositoryCount: org.repos,
  // Named up to the same hundred the API sends, so a row with more than that renders its
  // "+N more" tail here too rather than only in production.
  repositories: Array.from(
    { length: Math.min(org.repos, 100) },
    (_, index) => ({
      repositoryId: `${org.id}-${index}`,
      fullName: `${org.login}/${REPO_NAMES[index % REPO_NAMES.length]}-${index}`,
      private: index % 3 === 0,
    })
  ),
  manageUrl: "#",
}));

const noop = () => {};

/** The real dashboard page, on the same mock rows as the other drafts. */
export function MinimalDraft() {
  return (
    <DashboardPage
      className="h-full"
      user={{ login: MOCK_USER.login, avatarUrl: MOCK_USER.avatarUrl }}
      onLogout={noop}
      connections={CONNECTIONS}
      installUrl="#"
      loading={false}
      pendingIds={[]}
      actionError={null}
      onSubscribe={noop}
      onUnsubscribe={noop}
      onUninstall={noop}
      slack={{
        connection: {
          status: "linked",
          teamName: "Acme",
          slackHandle: MOCK_USER.login,
          connectUrl: "#",
          configured: true,
        },
        loading: false,
        testState: "idle",
        actionError: null,
        onDisconnect: noop,
        onTest: noop,
      }}
    />
  );
}

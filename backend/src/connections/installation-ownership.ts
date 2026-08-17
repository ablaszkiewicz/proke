import { InstallationNormalized } from '../installations/core/entities/installation.interface';
import { UserNormalized } from '../user/core/entities/user.interface';

/**
 * Whether a *personal* installation sits on this user's own account.
 *
 * Asks by account id rather than by handle. Handles move: GitHub frees one the moment its owner
 * renames, so a comparison of two strings that both change is the wrong question to ask about
 * ownership. The login check stays as a fallback for payloads carrying no account id.
 *
 * Says nothing about organisations, where standing is GitHub's to report and only
 * `GET /user/memberships/orgs/{org}` can answer. Callers must not reach here for one.
 *
 * Shared because two things ask it for different reasons - the label on a row, and whether
 * somebody may uninstall - and an ownership test that means one thing in the read path and
 * another in the write path is a security bug waiting for a refactor.
 */
export function ownsPersonalAccount(
  user: UserNormalized,
  installation: InstallationNormalized,
): boolean {
  const byId =
    Boolean(installation.accountId) &&
    Boolean(user.githubId) &&
    installation.accountId === user.githubId;

  const byLogin =
    !installation.accountId &&
    Boolean(user.githubLogin) &&
    installation.accountLogin.toLowerCase() === user.githubLogin!.toLowerCase();

  return byId || byLogin;
}

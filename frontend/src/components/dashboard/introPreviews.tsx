import {
  Avatar,
  ICON,
  Octicon,
  Preview,
  Who,
} from "@/components/notifications/notificationTypes";
import type { ReactNode } from "react";

/**
 * The noise. GitHub happenings nobody needs a poke about - pushes, releases, bots, green
 * checks - stacked above the real six so the reel has something to scroll *through* on its way
 * in. Once it has settled on the first real one these are behind it for good: no row leads
 * back up here.
 *
 * Same frame as the real previews so every slot in the reel is the same height.
 */
export const INTRO_PREVIEWS: (() => ReactNode)[] = [
  () => (
    <Preview
      icon={<Avatar />}
      header={
        <>
          <Who>octocat</Who> pushed 3 commits to{" "}
          <span className="font-mono text-[10px]">main</span>
        </>
      }
      body="chore: bump deps · docs: fix typo · ci: cache pnpm store"
    />
  ),
  () => (
    <Preview
      icon={<Octicon path={ICON.tag} className="text-muted-foreground" />}
      header={
        <>
          <Who>v0.4.1</Who> released
        </>
      }
      body="12 commits from 3 contributors since v0.4.0"
    />
  ),
  () => (
    <Preview
      icon={<Avatar />}
      header={
        <>
          <Who>dependabot[bot]</Who> opened <Who>#38</Who>
        </>
      }
      body="chore(deps): bump vite from 7.1.1 to 7.1.2"
    />
  ),
  () => (
    <Preview
      icon={<Octicon path={ICON.check} className="text-emerald-500" />}
      header={
        <>
          All checks passed on{" "}
          <span className="font-mono text-[10px]">feature/webhooks</span>
        </>
      }
      body="lint · typecheck · e2e — 2m 14s"
    />
  ),
  () => (
    <Preview
      icon={<Octicon path={ICON.star} className="text-amber-500" />}
      header={
        <>
          <Who>octocat</Who> starred <Who>proke-io/proke</Who>
        </>
      }
      body="128 stars · 12 forks · 4 watching"
    />
  ),
];

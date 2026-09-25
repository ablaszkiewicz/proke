import { Announcement } from './announcement.interface';

const ID_PATTERN = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Slack's own limits. Past any of them it refuses the message rather than trimming it. */
const MAX_BODY_CHARS = 3000;
const MAX_BUTTONS = 25;
const MAX_BUTTON_LABEL_CHARS = 75;
const MAX_BUTTON_URL_CHARS = 3000;

/**
 * Everything wrong with a list of announcements, and empty when nothing is.
 *
 * Checked by a spec, so a bad one fails CI, and again before anything is sent. The second check
 * is the one that matters: Slack rejects a malformed message for every recipient alike, and each
 * of them would be recorded as having had their try at it.
 */
export function announcementProblems(announcements: readonly Announcement[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();

  for (const announcement of announcements) {
    const { id } = announcement;

    if (!ID_PATTERN.test(id)) {
      problems.push(`${id}: the id must look like YYYY-MM-DD-some-slug`);
    }

    if (seen.has(id)) {
      problems.push(`${id}: the id is used twice, so the second one would never be sent`);
    }

    seen.add(id);

    if (!announcement.text.trim()) {
      problems.push(`${id}: the text is empty`);
    }

    if ((announcement.body ?? announcement.text).length > MAX_BODY_CHARS) {
      problems.push(`${id}: the message is over Slack's ${MAX_BODY_CHARS} characters`);
    }

    const buttons = announcement.buttons ?? [];

    if (buttons.length > MAX_BUTTONS) {
      problems.push(`${id}: Slack allows ${MAX_BUTTONS} buttons at most`);
    }

    for (const button of buttons) {
      if (!button.label.trim() || button.label.length > MAX_BUTTON_LABEL_CHARS) {
        problems.push(`${id}: a button label must be 1 to ${MAX_BUTTON_LABEL_CHARS} characters`);
      }

      if (!isButtonUrl(button.url)) {
        problems.push(`${id}: ${button.url} is neither an https URL nor a path like /app`);
      }
    }
  }

  return problems;
}

function isButtonUrl(url: string): boolean {
  if (url.length > MAX_BUTTON_URL_CHARS) {
    return false;
  }

  // One slash, not two: `//evil.example` is a path to the browser and a host to URL().
  if (url.startsWith('/') && !url.startsWith('//')) {
    return true;
  }

  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

/** A path is joined onto the frontend's origin; anything else was checked as absolute above. */
export function resolveButtonUrl(url: string, appUrl: string): string {
  return url.startsWith('/') ? `${appUrl}${url}` : url;
}

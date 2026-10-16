import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";

/**
 * A list of GitHub logins, typed in one at a time and held as chips.
 *
 * Lifted out of the inbox's "Ignore authors" when the dashboard wanted the same field twice for
 * who counts as a bot - and two copies of a field that commits on its way out would be two
 * places to forget that it does.
 *
 * ## Why chips rather than a comma-separated field
 *
 * Because a name is either in the list or it is not, and a text field makes that a question
 * about punctuation. A chip is committed - it has been accepted, it is on screen, and it has an
 * × - where "dependabot, renov" is a half-typed state that has to mean something and cannot.
 *
 * It also decides when anything is saved. Every commit here is one round trip, so a field that
 * fired as you typed would be a request per keystroke; a chip fires once, when you say so.
 *
 * ## What is accepted
 *
 * Whatever `normalize` makes of it, which by default is a login lowercased with a leading `@`
 * forgiven - somebody typing a GitHub handle types the `@`, and refusing it teaches nothing.
 * Anything already in the list is a no-op rather than a duplicate, and the field clears either
 * way: pressing Enter twice on the same name should feel like it worked twice, because it did.
 */
export function LoginsInput({
  id,
  logins,
  onChange,
  placeholder,
  removeLabel,
  normalize = normalizeLogin,
  className,
}: {
  /** For the `<label>` the caller draws above it. */
  id: string;
  logins: string[];
  onChange: (logins: string[]) => void;
  placeholder: string;
  /** What the × on a chip says to a screen reader, given the login it removes. */
  removeLabel: (login: string) => string;
  /** The one spelling that reaches the wire. Must agree with how the server matches. */
  normalize?: (value: string) => string;
  className?: string;
}) {
  const [draft, setDraft] = useState("");

  const commit = () => {
    const login = normalize(draft);

    // Something typed that `normalize` refused stays in the field to be corrected, rather than
    // vanishing as though it had been taken - or becoming a chip the server then turns down.
    if (!login) {
      if (!draft.trim()) {
        setDraft("");
      }

      return;
    }

    setDraft("");

    if (!logins.includes(login)) {
      onChange([...logins, login]);
    }
  };

  // Whatever holds this may unmount it - a panel closing, a dialog dismissed - and React does
  // not fire blur on an element it is removing. Without this, a name typed and then dismissed
  // with a click outside would be dropped on the floor, while the same name typed and dismissed
  // with a click inside would be kept. Two ways of leaving one field behaving differently is
  // worse than either.
  //
  // Through a ref because the cleanup runs once, holding whichever closure it was created with,
  // and the draft it needs to commit is the last one rather than the first.
  const pending = useRef(commit);
  pending.current = commit;
  useEffect(() => () => pending.current(), []);

  return (
    <div className={className}>
      {logins.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {logins.map((login) => (
            <LoginChip
              key={login}
              login={login}
              removeLabel={removeLabel(login)}
              onRemove={() => onChange(logins.filter((kept) => kept !== login))}
            />
          ))}
        </div>
      ) : null}

      <input
        id={id}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          // Comma as well as Enter, because somebody pasting a list types the separator they
          // would have used in a text field.
          if (event.key === "Enter" || event.key === ",") {
            event.preventDefault();
            commit();

            return;
          }

          // Backspace on an empty field takes the last chip, which is what every field of chips
          // anywhere does and the only way to correct a mistake without reaching for the mouse.
          if (event.key === "Backspace" && !draft && logins.length > 0) {
            onChange(logins.slice(0, -1));
          }
        }}
        // Committed on the way out, like every field of chips anywhere: a name typed and then
        // left is a name somebody meant. See the unmount above for the other way out.
        onBlur={commit}
        placeholder={placeholder}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        className={cn(
          "mt-2 w-full rounded-lg bg-foreground/[0.06] px-2 py-1.5 text-[13px] text-foreground",
          "placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:-outline-offset-2"
        )}
      />
    </div>
  );
}

/** One committed login. The × is the control; the word beside it is not. */
function LoginChip({
  login,
  removeLabel,
  onRemove,
}: {
  login: string;
  removeLabel: string;
  onRemove: () => void;
}) {
  return (
    <span className="flex items-center gap-1 rounded-md bg-foreground/10 py-0.5 pl-1.5 pr-1 text-[12px] text-foreground">
      <span className="max-w-[10rem] truncate">{login}</span>

      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel}
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors",
          "hover:bg-foreground/10 hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2"
        )}
      >
        <svg viewBox="0 0 12 12" className="size-2.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
          <path d="M3 3l6 6M9 3l-6 6" />
        </svg>
      </button>
    </span>
  );
}

/**
 * A login as somebody typed it, in the spelling the server compares.
 *
 * Lowercased because GitHub logins differ only in case and the reader typed theirs by hand; the
 * `@` forgiven because a handle is written with one everywhere else.
 */
export function normalizeLogin(value: string): string {
  return value.trim().replace(/^@+/, "").toLowerCase();
}

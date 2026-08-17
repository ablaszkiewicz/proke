import { Button } from "@/components/ui/button";
import {
  captureSurveyDismissed,
  captureSurveySent,
  captureSurveyShown,
  loadFeedbackSurvey,
  newSubmissionId,
  type SurveyResponses,
} from "@/lib/analytics/surveys";
import { cn } from "@/lib/utils";
import type { BasicSurveyQuestion, RatingSurveyQuestion, Survey } from "posthog-js";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ToggleEvent,
} from "react";

/** How long the thank-you sits there before the popover puts itself away. */
const SENT_LINGER_MS = 1800;

/** Between the top of the link and the bottom of the panel. */
const GAP_PX = 10;

/**
 * "Feedback", in the footer, between who you are and the way out.
 *
 * The survey it asks is a real PostHog survey - see lib/analytics/surveys.ts - but PostHog does
 * not draw it. Its own popover is a good one and completely unlike the rest of proke, which for
 * a page this quiet is the whole problem: it would read as a thing bolted onto the product
 * rather than part of it. So the questions come down over the wire and this draws them.
 *
 * Nothing renders until the survey has arrived. Without a PostHog key, or with the survey
 * stopped, there is no link at all rather than one that opens onto an apology.
 */
export function FeedbackButton({ className }: { className?: string }) {
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [isSent, setIsSent] = useState(false);

  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const submissionRef = useRef("");
  const lingerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Read by the close handler, which must not report a dismissal for a popover that closed
  // because the feedback went through. A ref rather than the isSent state because the two are
  // set in the same tick and the handler needs the new value, not the one it rendered with.
  const sentRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    void loadFeedbackSurvey().then((loaded) => {
      if (!cancelled) {
        setSurvey(loaded);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => () => clearTimeout(lingerRef.current), []);

  /**
   * Puts the panel above the link and centred on it.
   *
   * Anchored by `bottom` rather than `top` so the panel's own height never has to be measured -
   * which cannot be done until it is shown, and measuring after showing is one frame of the
   * panel in the wrong place. Centring is left to a CSS translate for the same reason: it needs
   * the width, and this way nothing here does.
   */
  const place = useCallback(() => {
    const trigger = triggerRef.current;
    const panel = panelRef.current;

    if (!trigger || !panel) {
      return;
    }

    const rect = trigger.getBoundingClientRect();

    panel.style.left = `${rect.left + rect.width / 2}px`;
    panel.style.bottom = `${window.innerHeight - rect.top + GAP_PX}px`;
  }, []);

  // The panel is in the top layer, so it does not move with the page the way an absolutely
  // positioned child of the footer would. Anything that moves the link has to move it too.
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);

    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [isOpen, place]);

  // Rating first, open question second is only the order they happen to be in. Found by type so
  // that reordering them in PostHog - or adding a description, or renaming one - changes what
  // this renders rather than breaking it.
  const ratingQuestion = survey?.questions.find(isRatingQuestion);
  const openQuestion = survey?.questions.find(isOpenQuestion);

  const responses: SurveyResponses = {};
  if (ratingQuestion?.id && rating !== null) {
    responses[ratingQuestion.id] = rating;
  }
  if (openQuestion?.id && text.trim()) {
    responses[openQuestion.id] = text.trim();
  }

  // What is still missing, in the words shown next to a Send that cannot be pressed yet - a
  // greyed-out button with no reason given is the kind of thing people close the popover over.
  //
  // Which answers are required is the survey's business, not this component's, so it is asked
  // rather than assumed: making the rating optional in PostHog both enables the button and
  // stops this from claiming otherwise.
  const blocker =
    ratingQuestion?.optional !== true && rating === null
      ? "Pick a rating to send."
      : openQuestion?.optional !== true && text.trim() === ""
        ? "Write something to send."
        : null;
  const isAnswered = blocker === null;

  /*
   * Everything below is set up before the browser shows the panel, on the same event that shows
   * it. beforetoggle is the only moment where both are true: the popover is definitely opening,
   * and it has not been painted yet - so the position lands without a flash, and last time's
   * answers are gone before anyone can see them.
   */
  const handleBeforeToggle = (event: ToggleEvent<HTMLDivElement>) => {
    if (event.newState !== "open") {
      return;
    }

    place();
    submissionRef.current = newSubmissionId();
    sentRef.current = false;
    setRating(null);
    setText("");
    setIsSent(false);
  };

  const handleToggle = (event: ToggleEvent<HTMLDivElement>) => {
    const opened = event.newState === "open";
    setIsOpen(opened);

    if (!survey) {
      return;
    }

    if (opened) {
      // Showing a popover does not move focus into it unless something inside asks for it. The
      // panel takes it itself rather than a control inside, so Tab runs the questions in order
      // and a reflexive Enter cannot pick a rating nobody meant to give.
      panelRef.current?.focus();
      captureSurveyShown(survey);
      return;
    }

    if (!sentRef.current) {
      captureSurveyDismissed(survey, submissionRef.current, responses);
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    if (!survey || !isAnswered) {
      return;
    }

    captureSurveySent(survey, submissionRef.current, responses);
    sentRef.current = true;
    setIsSent(true);

    lingerRef.current = setTimeout(() => panelRef.current?.hidePopover(), SENT_LINGER_MS);
  };

  if (!survey || !ratingQuestion || !openQuestion) {
    return null;
  }

  const appearance = survey.appearance;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        // The browser owns the open/close from here: light dismissal, Escape, the top layer,
        // and handing focus back to this button on the way out. The same trade Modal.tsx makes
        // with <dialog>, for the same reason - these are the parts that are easy to get wrong
        // and invisible when you do.
        popoverTarget={panelId}
        className={cn(
          "cursor-pointer underline decoration-dotted underline-offset-4 transition-colors hover:text-foreground",
          className
        )}
      >
        Feedback
      </button>

      {/*
        Positioning only. A popover's UA styles centre it in the viewport and give it a margin,
        so `inset-auto m-0` is what hands that back to `place` above. The card - and the motion,
        which is a transform and would otherwise fight the centring translate on this element -
        is the div inside.

        `overflow-visible` undoes the UA `overflow: auto` as well: the card rises into place
        from 6px below, which is 6px of overflow for the length of the animation, which the
        browser answers with a scrollbar that appears and then leaves - taking the card's width
        with it both times.
      */}
      <div
        ref={panelRef}
        id={panelId}
        popover="auto"
        role="dialog"
        aria-label="Send feedback"
        tabIndex={-1}
        onBeforeToggle={handleBeforeToggle}
        onToggle={handleToggle}
        className="fixed inset-auto m-0 w-[min(20rem,calc(100vw-2rem))] -translate-x-1/2 overflow-visible bg-transparent p-0 outline-none"
      >
        <div className="animate-rise-in rounded-xl border bg-card p-4 text-left text-card-foreground shadow-xl">
          {isSent ? (
            <div className="animate-fade-in py-6 text-center">
              <p className="text-sm font-medium">
                {appearance?.thankYouMessageHeader ?? "Thanks."}
              </p>
              {appearance?.thankYouMessageDescription ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {appearance.thankYouMessageDescription}
                </p>
              ) : null}
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <fieldset>
                <legend className="text-sm font-medium text-balance">
                  {ratingQuestion.question}
                </legend>
                <QuestionDescription>{ratingQuestion.description}</QuestionDescription>

                <div className="mt-3 flex gap-1.5">
                  {scaleValues(ratingQuestion.scale).map((value) => {
                    const isPicked = rating === value;

                    return (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={isPicked}
                        onClick={() => setRating(value)}
                        className={cn(
                          "h-9 flex-1 cursor-pointer rounded-md border text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
                          isPicked
                            ? "border-primary bg-primary text-primary-foreground"
                            : "hover:bg-accent"
                        )}
                      >
                        {value}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
                  <span>{ratingQuestion.lowerBoundLabel}</span>
                  <span>{ratingQuestion.upperBoundLabel}</span>
                </div>
              </fieldset>

              <label className="mt-4 block">
                <span className="text-sm font-medium text-balance">
                  {openQuestion.question}
                </span>
                <QuestionDescription>{openQuestion.description}</QuestionDescription>

                <textarea
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  rows={3}
                  placeholder={appearance?.placeholder ?? undefined}
                  className="mt-2 w-full resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                />
              </label>

              {/* Faded rather than unmounted, so the row does not change height as it goes. */}
              <div className="mt-3 flex items-center justify-between gap-3">
                <p
                  className={cn(
                    "text-[10px] text-muted-foreground transition-opacity duration-200",
                    blocker ? "opacity-100" : "opacity-0"
                  )}
                >
                  {blocker ?? ""}
                </p>

                <Button type="submit" size="sm" disabled={!isAnswered}>
                  {appearance?.submitButtonText ?? "Send"}
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * A question's helper text, when it has one.
 *
 * Rendered as text even where PostHog would allow html - a survey's copy is editable by anyone
 * with access to the project, and that is not a reason to hand them the page.
 */
function QuestionDescription({ children }: { children?: string | null }) {
  if (!children) {
    return null;
  }

  return <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{children}</p>;
}

/** 1..n. The scale is the survey's to choose, so nothing here assumes it is five. */
function scaleValues(scale: number): number[] {
  return Array.from({ length: scale }, (_, index) => index + 1);
}

function isRatingQuestion(
  question: Survey["questions"][number]
): question is RatingSurveyQuestion {
  return question.type === "rating";
}

function isOpenQuestion(
  question: Survey["questions"][number]
): question is BasicSurveyQuestion {
  return question.type === "open";
}

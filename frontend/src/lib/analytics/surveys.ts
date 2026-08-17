import posthog from "posthog-js";
import type { Survey } from "posthog-js";

import { isAnalyticsInitialized } from "./analytics";

/**
 * The survey behind the "Feedback" link in the dashboard footer.
 *
 * Its type in PostHog is `api`, which is PostHog's word for "this app draws it itself". PostHog
 * will not render an `api` survey, so the popover in components/feedback is the only thing that
 * ever shows it, and nothing here has to fight the library's own widget for the screen.
 *
 * The id is a public identifier, not a secret - it is in every `survey sent` event the browser
 * emits either way.
 *
 * https://eu.posthog.com/project/250294/surveys/01a0114c-f410-0000-7da2-6defdbd86913
 */
const FEEDBACK_SURVEY_ID = "01a0114c-f410-0000-7da2-6defdbd86913";

/** One question's answer, keyed by that question's id in PostHog. */
export type SurveyResponses = Record<string, string | number>;

/**
 * The survey as PostHog currently has it, or null if there is nothing to show.
 *
 * Everything the popover puts on screen - the two questions, the rating scale, the placeholder,
 * the button label, the thank you - is read off what this returns. That is the point of
 * fetching rather than hardcoding: the copy is editable in PostHog without a deploy, and the
 * question ids responses are filed under can never drift from the ones the survey actually has.
 *
 * `getSurveys` rather than `getActiveMatchingSurveys`, which is what PostHog's docs reach for
 * first. The difference is targeting, and targeting is the one thing this survey must not have.
 * Every survey gets an internal targeting flag that excludes anyone with
 * `$survey_responded/<id>` or `$survey_dismissed/<id>` set, and posthog-js sets both of those
 * from inside `capture()` on any `survey sent` or `survey dismissed` - not from a `$set` we
 * pass, so there is no opting out of it. Under getActiveMatchingSurveys the Feedback link would
 * disappear the first time anyone used it, and proke wants feedback more than once per person.
 *
 * getSurveys returns what the surveys endpoint serves - every launched survey in the project,
 * no flags evaluated. That endpoint only serves launched surveys, so if this one is ever
 * stopped or put back to draft this resolves to null and the link quietly stops being there.
 */
export function loadFeedbackSurvey(): Promise<Survey | null> {
  if (!isAnalyticsInitialized()) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    posthog.getSurveys((surveys) => {
      resolve(surveys.find((survey) => survey.id === FEEDBACK_SURVEY_ID) ?? null);
    });
  });
}

/**
 * One id per opened popover.
 *
 * It is what ties a dismissal and a later send to the same attempt, instead of PostHog counting
 * someone who opened the popover, closed it and came back as two people who half-answered.
 */
export function newSubmissionId(): string {
  return crypto.randomUUID();
}

/*
 * The three events a survey produces.
 *
 * These are the only events proke sends without the `frontend_` prefix, and the exception is
 * not an oversight - `survey shown`, `survey sent` and `survey dismissed` are PostHog's own
 * reserved names. The Surveys product reads them by name to build its response feed and its
 * completion rate, and a `frontend_survey_sent` would be a custom event PostHog has never heard
 * of, landing nowhere near the survey it answers. Same reason the properties below are `$`
 * prefixed: they are PostHog's schema, not ours.
 */

/** The popover opened. The other half of every completion rate the survey page shows. */
export function captureSurveyShown(survey: Survey): void {
  capture("survey shown", {
    $survey_id: survey.id,
    $survey_name: survey.name,
  });
}

export function captureSurveySent(
  survey: Survey,
  submissionId: string,
  responses: SurveyResponses
): void {
  capture("survey sent", {
    $survey_id: survey.id,
    $survey_name: survey.name,
    $survey_submission_id: submissionId,
    // Both questions are asked and answered on one screen, so anything sent is the whole thing.
    $survey_completed: true,
    ...responseProperties(survey, responses),
  });
}

/** Closed without sending. Carries whatever had been filled in, which is the interesting part. */
export function captureSurveyDismissed(
  survey: Survey,
  submissionId: string,
  responses: SurveyResponses
): void {
  capture("survey dismissed", {
    $survey_id: survey.id,
    $survey_name: survey.name,
    $survey_submission_id: submissionId,
    $survey_partially_completed: Object.keys(responses).length > 0,
    ...responseProperties(survey, responses),
  });
}

/**
 * The answers, in both shapes PostHog reads.
 *
 * `$survey_response_<question id>` is the current one and the only one that survives a question
 * being reordered in PostHog. `$survey_response` and `$survey_response_<index>` are what it used
 * before questions had ids, and parts of the product still read those. posthog-js sends both
 * from its own renderer, so this does too rather than betting on which.
 */
function responseProperties(
  survey: Survey,
  responses: SurveyResponses
): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    $survey_questions: survey.questions.map((question) => ({
      id: question.id,
      question: question.question,
      response: question.id === undefined ? undefined : responses[question.id],
    })),
  };

  survey.questions.forEach((question, index) => {
    const response = question.id === undefined ? undefined : responses[question.id];

    // Left out entirely rather than sent as null, so a skipped question reads as unanswered
    // instead of answered with nothing.
    if (response === undefined) {
      return;
    }

    properties[`$survey_response_${question.id}`] = response;
    properties[index === 0 ? "$survey_response" : `$survey_response_${index}`] = response;
  });

  return properties;
}

function capture(event: string, properties: Record<string, unknown>): void {
  if (!isAnalyticsInitialized()) {
    return;
  }

  posthog.capture(event, properties);
}

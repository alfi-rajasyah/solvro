// Upper bounds for client-supplied arrays, so a request body cannot ask for an
// unbounded number of rows or lookups
// (docs/archive/plans/application-review-2026-10-22.md, F-31).

/** Labels on one task (or one new task). */
export const MAX_LABEL_IDS = 50;

/** Tools listed on one service assignment (each tool name is at most 100 characters). */
export const MAX_SERVICE_TOOLS = 50;

/**
 * Activity notes returned for one deal. The deal page renders the whole feed
 * without paging, so the cap is generous; it only stops a deal with a huge
 * history from producing an unbounded response. Newest first, so the oldest
 * notes are the ones left out.
 */
export const MAX_DEAL_ACTIVITIES = 500;

/** Service-catalogue assignments on one project or customer. */
export const MAX_SERVICE_ASSIGNMENTS = 200;

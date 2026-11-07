// Route pattern -> page title + breadcrumb trail for the TopBar. Pure module
// (no React, no data fetching) so it stays unit-testable in the node-env
// Vitest config; the TopBar feeds it whatever project/customer names the
// existing `useProject` / `useCustomer` queries already hold.
//
// Titles for the static pages deliberately match the page H1 and the sidebar
// label (`NAV_COMMANDS`), so the bar and the page never disagree.

export interface Crumb {
  label: string;
  /** Present on every crumb except the last one (the current page). */
  to?: string;
}

/** Names resolved from cached queries; every field is optional while loading. */
export interface CrumbContext {
  projectName?: string | null;
  /** The project's customer (from `useProject`), if it has one. */
  projectCustomer?: { id: number; name: string } | null;
  customerName?: string | null;
  /** The opportunity's title (from `useOpportunity`), on `/pipeline/:id`. */
  opportunityTitle?: string | null;
}

export type RouteKind = "static" | "project" | "customer" | "opportunity" | "notFound";

export interface RouteMatch {
  kind: RouteKind;
  title: string;
  /** Set when `kind === "project"`. */
  projectId: number | null;
  /** Set when `kind === "customer"`. */
  customerId: number | null;
  /** Set when `kind === "opportunity"` (pipeline ids are strings, not numbers). */
  opportunityId: string | null;
}

/** Top-level path segment -> title. `work-logs` is a redirect to Utilization. */
const STATIC_TITLES: Record<string, string> = {
  overview: "Overview",
  projects: "Projects",
  customers: "Customers",
  pipeline: "Pipeline",
  "daily-review": "Daily Review",
  "weekly-sync": "Weekly Sync",
  tasks: "Tasks",
  utilization: "Utilization",
  "work-logs": "Utilization",
  executive: "Executive",
  settings: "Settings",
  admin: "Admin",
  help: "Help",
};

/** `/` redirects to `/overview`, so the bare root reads as Overview. */
const FALLBACK_TITLE = "Overview";

/**
 * Title for a path no route claims — App.tsx renders the NotFound page there
 * instead of redirecting (docs/archive/plans/application-review-2026-10-22.md, F-45).
 */
const NOT_FOUND_TITLE = "Not found";

/**
 * The `projects/:id/<view>` tabs App.tsx declares. A third segment outside this
 * set falls through to the catch-all, so it must read as "Not found" here too
 * rather than as a project page (`routeMeta.test.ts` checks it against App.tsx).
 */
const PROJECT_VIEWS: ReadonlySet<string> = new Set([
  "overview",
  "list",
  "kanban",
  "gantt",
  "epics",
  "timeline",
  "risks",
  "services",
]);

const NUMERIC = /^\d+$/;

function segmentsOf(pathname: string): string[] {
  return pathname.split("/").filter(Boolean);
}

export function matchRoute(pathname: string): RouteMatch {
  // React Router matches paths case-insensitively, so `/Overview` renders the
  // real page; compare lowercased, but keep the original casing of ids that
  // are passed on (the opportunity id).
  const rawSegments = segmentsOf(pathname);
  const segments = rawSegments.map((seg) => seg.toLowerCase());
  const [first, second, third] = segments;

  const notFound: RouteMatch = {
    kind: "notFound",
    title: NOT_FOUND_TITLE,
    projectId: null,
    customerId: null,
    opportunityId: null,
  };
  if (first !== undefined) {
    if (first === "projects") {
      // projects/:id and projects/:id/<view>; anything deeper or off-list is the catch-all.
      if (segments.length > 3 || (third !== undefined && !PROJECT_VIEWS.has(third))) return notFound;
    } else if (first === "customers" || first === "pipeline") {
      if (segments.length > 2) return notFound;
    } else if (!Object.prototype.hasOwnProperty.call(STATIC_TITLES, first) || segments.length > 1) {
      return notFound;
    }
  }

  if (first === "projects" && second && NUMERIC.test(second)) {
    return { kind: "project", title: "Project", projectId: Number(second), customerId: null, opportunityId: null };
  }
  if (first === "customers" && second && NUMERIC.test(second)) {
    return { kind: "customer", title: "Customer", projectId: null, customerId: Number(second), opportunityId: null };
  }
  if (first === "pipeline" && second) {
    return {
      kind: "opportunity",
      title: "Opportunity",
      projectId: null,
      customerId: null,
      opportunityId: rawSegments[1] ?? second,
    };
  }
  return {
    kind: "static",
    title: (first !== undefined && STATIC_TITLES[first]) || FALLBACK_TITLE,
    projectId: null,
    customerId: null,
    opportunityId: null,
  };
}

/** Plain-text page title, e.g. for `document.title`; never "Solvro". */
export function routeTitle(pathname: string, ctx: CrumbContext = {}): string {
  const crumbs = buildCrumbs(pathname, ctx);
  return crumbs[crumbs.length - 1]?.label ?? FALLBACK_TITLE;
}

/** Browser-tab title for a route: "<page> · Solvro", or just "Solvro" if the page title is empty. */
export function documentTitle(pathname: string, ctx: CrumbContext = {}): string {
  const title = routeTitle(pathname, ctx).trim();
  return title ? `${title} · Solvro` : "Solvro";
}

export function buildCrumbs(pathname: string, ctx: CrumbContext = {}): Crumb[] {
  const match = matchRoute(pathname);

  if (match.kind === "project") {
    const crumbs: Crumb[] = [{ label: "Projects", to: "/projects" }];
    if (ctx.projectCustomer) {
      crumbs.push({
        label: ctx.projectCustomer.name,
        to: `/customers/${ctx.projectCustomer.id}`,
      });
    }
    crumbs.push({ label: ctx.projectName || match.title });
    return crumbs;
  }

  if (match.kind === "customer") {
    return [
      { label: "Customers", to: "/customers" },
      { label: ctx.customerName || match.title },
    ];
  }

  if (match.kind === "opportunity") {
    return [
      { label: "Pipeline", to: "/pipeline" },
      { label: ctx.opportunityTitle || match.title },
    ];
  }

  return [{ label: match.title }];
}

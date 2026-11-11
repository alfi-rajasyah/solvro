import type { InfiniteData, UseInfiniteQueryResult } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AssigneeAvatar } from "@/components/AssigneeAvatar";
import { SkeletonRegion } from "@/components/skeletons/SkeletonRegion";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { describeActivity } from "@/lib/activityText";
import { hasPermission, useAuth } from "@/lib/auth";
import { fmtAgo, fmtDateTime } from "@/lib/formatDate";
import {
  ACTIVITY_MAX_PAGES,
  type ActivityEvent,
  type ActivityPage,
  useProjectActivity,
  useProjectMembers,
} from "@/lib/queries";

const ALL_PEOPLE = "all";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30";

/**
 * "Recent activity" on the project Overview (docs/archive/plans/collaboration-and-sharing.md,
 * C5a): one plain sentence per event, newest first, filterable by person and
 * paged with "Load more". `taskIds` are the tasks that still exist; only those
 * get a link, so a deleted task never points at a dead panel. The person
 * filter lists everyone who can act on the project: its TAM, its Solution
 * Architect (if any) and its members.
 */
export function ProjectActivity({
  projectId,
  tam,
  sa = null,
  taskIds,
}: {
  projectId: number;
  tam: { id: number; username: string };
  sa?: { id: number; username: string } | null;
  taskIds: ReadonlySet<number>;
}) {
  const [person, setPerson] = useState<string>(ALL_PEOPLE);
  const actorId = person === ALL_PEOPLE ? null : Number(person);
  const { data: members } = useProjectMembers(projectId);
  const query = useProjectActivity(projectId, { actorId });

  const options = useMemo(() => {
    const people = new Map<number, string>();
    people.set(tam.id, tam.username);
    if (sa) people.set(sa.id, sa.username);
    for (const m of members ?? []) people.set(m.userId, m.username);
    return [
      { value: ALL_PEOPLE, label: "Everyone" },
      ...[...people].map(([id, username]) => ({ value: String(id), label: username })),
    ];
  }, [tam.id, tam.username, sa, members]);

  return (
    <section
      aria-labelledby="project-activity-heading"
      className="rounded-sm border border-outline-variant bg-surface-container-lowest p-4"
    >
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="project-activity-heading" className="text-label-caps uppercase text-on-surface-variant">
          Recent activity
        </h2>
        <Select
          items={options}
          value={person}
          onValueChange={(v) => setPerson(typeof v === "string" ? v : ALL_PEOPLE)}
        >
          <SelectTrigger
            size="sm"
            className={`w-auto min-w-36 ${FOCUS_RING}`}
            aria-label="Filter activity by person"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </header>

      <ActivityFeedBody
        query={query}
        taskIds={taskIds}
        emptyText={
          actorId === null
            ? "Changes to tasks, risks, notes and members show up here."
            : "This person has not changed anything in this project yet."
        }
      />
    </section>
  );
}

/**
 * The shared body of an activity log: loading skeleton, error with retry,
 * empty state, the event rows, the 100-event cap note and "Load more". Used by
 * the project Overview and by a Pipeline deal's "Field changes".
 */
export function ActivityFeedBody({
  query,
  taskIds,
  emptyText,
  currentHref,
  filter,
}: {
  query: UseInfiniteQueryResult<InfiniteData<ActivityPage, unknown>, Error>;
  taskIds?: ReadonlySet<number>;
  emptyText: string;
  /** An entity link to this very page is dropped (a deal's own title on the deal page). */
  currentHref?: string;
  /** Keeps only matching events; paging still walks the whole log, so "Load more" stays available. */
  filter?: (event: ActivityEvent) => boolean;
}) {
  const { data, isLoading, isError, hasNextPage, fetchNextPage, isFetchingNextPage, refetch } = query;
  const loaded = useMemo(() => data?.pages.flatMap((p) => p.events) ?? [], [data]);
  const events = useMemo(() => (filter ? loaded.filter(filter) : loaded), [loaded, filter]);

  return (
    <>
      {isLoading ? (
        <SkeletonRegion className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8" />
          ))}
        </SkeletonRegion>
      ) : isError ? (
        <div className="flex items-center gap-3 rounded-sm border border-dashed border-outline-variant px-3 py-4 text-xs text-on-surface-variant">
          <span className="material-symbols-outlined text-base" aria-hidden="true">
            error
          </span>
          <span>Could not load activity.</span>
          <button
            type="button"
            onClick={() => void refetch()}
            className={`rounded-sm font-semibold text-primary hover:underline ${FOCUS_RING}`}
          >
            Try again
          </button>
        </div>
      ) : events.length === 0 && !hasNextPage ? (
        <div className="flex flex-col items-center gap-1 rounded-sm border border-dashed border-outline-variant px-3 py-8 text-center">
          <span className="material-symbols-outlined text-2xl text-on-surface-variant" aria-hidden="true">
            history
          </span>
          <p className="font-display text-sm font-semibold text-on-surface">No activity yet</p>
          <p className="text-xs text-on-surface-variant">
            {emptyText}
          </p>
        </div>
      ) : (
        <>
          {events.length === 0 && (
            <p className="py-3 text-center text-xs text-on-surface-variant">{emptyText}</p>
          )}
          <ul className="divide-y divide-outline-variant">
            {events.map((event) => (
              <ActivityRow key={event.id} event={event} taskIds={taskIds} currentHref={currentHref} />
            ))}
          </ul>
          {!hasNextPage && data && data.pages.length >= ACTIVITY_MAX_PAGES && (
            <p className="mt-3 text-center text-meta text-on-surface-variant">
              Showing the latest {loaded.length} events.
            </p>
          )}
          {hasNextPage && (
            <div className="mt-3 flex justify-center">
              <button
                type="button"
                onClick={() => void fetchNextPage()}
                disabled={isFetchingNextPage}
                className={`inline-flex items-center gap-1.5 rounded-sm border border-outline-variant bg-surface-container-lowest px-3 py-1.5 text-xs font-semibold text-on-surface hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING}`}
              >
                {isFetchingNextPage ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}

function ActivityRow({
  event,
  taskIds,
  currentHref,
}: {
  event: ActivityEvent;
  taskIds?: ReadonlySet<number>;
  currentHref?: string;
}) {
  const { user } = useAuth();
  const sentence = describeActivity(event, { canViewPipeline: hasPermission(user, "pipeline:view") });
  const linkTaskId =
    sentence.taskId !== null && taskIds?.has(sentence.taskId) ? sentence.taskId : null;

  // The first emphasised name is the task the event is about.
  const firstEntity = sentence.parts.findIndex((p) => p.kind === "entity");

  return (
    <li className="flex items-start gap-2.5 py-2" data-testid="activity-event">
      <span className="mt-0.5 shrink-0">
        {event.actor ? (
          <AssigneeAvatar user={event.actor} />
        ) : (
          <span
            className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant"
            title="Unknown user"
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              person
            </span>
          </span>
        )}
      </span>
      <p className="min-w-0 flex-1 wrap-break-word text-sm text-on-surface">
        {sentence.parts.map((part, i) => {
          if (part.kind === "actor") {
            return (
              <span key={i} className="font-semibold">
                {part.text}
              </span>
            );
          }
          if (part.kind === "entity") {
            // A deal's or project's page (a handoff, a deal event in a log).
            if (part.href && part.href !== currentHref) {
              return (
                <Link
                  key={i}
                  to={part.href}
                  className={`rounded-sm font-semibold text-primary hover:underline ${FOCUS_RING}`}
                >
                  {part.text}
                </Link>
              );
            }
            return linkTaskId !== null && i === firstEntity ? (
              <Link
                key={i}
                to={`?task=${linkTaskId}`}
                className={`rounded-sm font-semibold text-primary hover:underline ${FOCUS_RING}`}
              >
                {part.text}
              </Link>
            ) : (
              <span key={i} className="font-semibold">
                {part.text}
              </span>
            );
          }
          return <span key={i}>{part.text}</span>;
        })}
      </p>
      <time
        dateTime={event.createdAt}
        title={fmtDateTime(event.createdAt)}
        className="mt-0.5 shrink-0 whitespace-nowrap text-meta text-on-surface-variant"
      >
        {fmtAgo(event.createdAt)}
      </time>
    </li>
  );
}

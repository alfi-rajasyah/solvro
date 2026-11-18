import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { EmptyState } from "@/components/EmptyState";
import { hasPermission, useAuth } from "@/lib/auth";
import {
  filterHelpGuides,
  filterHelpTopics,
  type HelpGuide,
  type HelpTopic,
} from "@/lib/helpContent";

// "How to use Solvro" — task-oriented Guides above a per-page Reference
// (docs/archive/plans/feedback-round-lifecycle-spec.md, F6). Content lives in
// lib/helpContent.ts; guides and topics gated by a permission (the TAM pages,
// Pipeline, Executive, Admin) are hidden with the same rule the sidebar uses.
// Reached from the TopBar's help button only (no sidebar or ⌘K entry, by user decision).
export function Help() {
  const { user } = useAuth();
  const { hash } = useLocation();
  const [query, setQuery] = useState("");
  const has = (p: string) => hasPermission(user, p);
  const guides = filterHelpGuides(has, query);
  const topics = filterHelpTopics(has, query);
  // Titles for the "Read more" links; a related topic that is hidden (no permission, or filtered out by the search) is skipped so no link dangles.
  const visibleTopicTitle = new Map(topics.map((t) => [t.id, t.title]));

  // /help#<topic> deep link: the sections render after the route mounts, so
  // the browser's own hash scroll finds nothing — scroll once they exist.
  // The page keeps settling after that first scroll: the web fonts (text and
  // the icon font) swap in late and change the height of every section above
  // the target, which left a deep link showing the wrong topic. Until the
  // reader scrolls or types, each change in the page's height scrolls the
  // target back into view.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!hash) return;
    const id = hash.slice(1);
    const scrollToTarget = () => document.getElementById(id)?.scrollIntoView();
    scrollToTarget();
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(scrollToTarget);
    observer.observe(root);
    const release = () => observer.disconnect();
    const events = ["wheel", "touchstart", "keydown", "mousedown"] as const;
    for (const e of events) window.addEventListener(e, release, { once: true, passive: true });
    const timer = window.setTimeout(release, 5000);
    return () => {
      release();
      window.clearTimeout(timer);
      for (const e of events) window.removeEventListener(e, release);
    };
  }, [hash]);

  return (
    <div ref={rootRef} className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-3">
        <div>
          <h1 className="font-display text-h1 text-on-surface">How to use Solvro</h1>
          <p className="text-sm text-on-surface-variant">
            Step-by-step guides for the jobs you do here, and a reference for every page available to you.
          </p>
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search help…"
          aria-label="Search help"
          className="w-full rounded-sm border border-outline-variant bg-surface-container-lowest px-3 py-1.5 text-sm text-on-surface placeholder:text-on-surface-variant focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 sm:w-80"
        />
      </header>

      {guides.length === 0 && topics.length === 0 ? (
        <EmptyState icon="search_off" message={`No help topics match "${query.trim()}".`} />
      ) : (
        <div className="flex gap-8">
          <nav aria-label="Help topics" className="hidden w-48 shrink-0 md:block">
            <div className="sticky top-0 -m-1 max-h-[calc(100vh-7rem)] space-y-4 overflow-y-auto p-1">
              {guides.length > 0 && (
                <NavGroup label="Guides" items={guides} />
              )}
              {topics.length > 0 && (
                <NavGroup label="Reference" items={topics} />
              )}
            </div>
          </nav>

          <div className="min-w-0 flex-1 space-y-8">
            {guides.length > 0 && (
              <section aria-labelledby="help-guides" className="space-y-4">
                <h2 id="help-guides" className="font-display text-h2 text-on-surface">
                  Guides
                </h2>
                {guides.map((g) => (
                  <GuideSection key={g.id} guide={g} topicTitle={visibleTopicTitle} />
                ))}
              </section>
            )}
            {topics.length > 0 && (
              <section aria-labelledby="help-reference" className="space-y-4">
                <h2 id="help-reference" className="font-display text-h2 text-on-surface">
                  Reference
                </h2>
                {topics.map((t) => (
                  <HelpSection key={t.id} topic={t} />
                ))}
              </section>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NavGroup({ label, items }: { label: string; items: ReadonlyArray<{ id: string; title: string; icon: string }> }) {
  return (
    <div>
      <p className="px-2 pb-1 text-label-caps uppercase text-on-surface-variant">{label}</p>
      <ul className="space-y-0.5">
        {items.map((t) => (
          <li key={t.id}>
            <a
              href={`#${t.id}`}
              className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-on-surface-variant hover:bg-surface-container hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">{t.icon}</span>
              {t.title}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

const LINK_CLASS =
  "text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30";

function GuideSection({ guide, topicTitle }: { guide: HelpGuide; topicTitle: ReadonlyMap<string, string> }) {
  const related = guide.related.filter((id) => topicTitle.has(id));
  return (
    <section
      id={guide.id}
      aria-labelledby={`${guide.id}-title`}
      className="scroll-mt-4 space-y-4 rounded-sm border border-outline-variant bg-surface-container-low p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="material-symbols-outlined text-[20px] text-primary">{guide.icon}</span>
          <h3 id={`${guide.id}-title`} className="text-lg font-semibold text-on-surface">
            {guide.title}
          </h3>
        </div>
        {guide.links && (
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {guide.links.map((l) => (
              <Link key={l.to} to={l.to} className={LINK_CLASS}>
                {l.label}
              </Link>
            ))}
          </div>
        )}
      </div>
      <p className="text-sm text-on-surface-variant">{guide.summary}</p>

      <ol className="space-y-4">
        {guide.steps.map((st, i) => (
          <li key={st.title} className="flex gap-3">
            <span
              aria-hidden="true"
              className="flex size-6 shrink-0 items-center justify-center rounded-sm bg-primary/10 text-meta font-semibold text-primary"
            >
              {i + 1}
            </span>
            <div className="min-w-0 flex-1 space-y-1.5">
              <h4 className="text-sm font-semibold text-on-surface">{st.title}</h4>
              <ul className="list-disc space-y-1 pl-5 text-sm text-on-surface marker:text-on-surface-variant">
                {st.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          </li>
        ))}
      </ol>

      {related.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-outline-variant pt-3 text-sm text-on-surface-variant">
          Read more:
          {related.map((id) => (
            <a key={id} href={`#${id}`} className={LINK_CLASS}>
              {topicTitle.get(id)}
            </a>
          ))}
        </p>
      )}
    </section>
  );
}

function HelpSection({ topic }: { topic: HelpTopic }) {
  return (
    <section
      id={topic.id}
      aria-labelledby={`${topic.id}-title`}
      className="scroll-mt-4 space-y-4 rounded-sm border border-outline-variant bg-surface-container-low p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="material-symbols-outlined text-[20px] text-primary">{topic.icon}</span>
          <h3 id={`${topic.id}-title`} className="text-lg font-semibold text-on-surface">
            {topic.title}
          </h3>
        </div>
        {topic.route && (
          <Link
            to={topic.route}
            className={LINK_CLASS}
          >
            Open {topic.title}
          </Link>
        )}
      </div>
      <p className="text-sm text-on-surface-variant">{topic.summary}</p>

      {topic.entries.map((e) => (
        <div key={e.title} className="space-y-1.5">
          <h4 className="text-label-caps uppercase text-on-surface-variant">{e.title}</h4>
          <ul className="list-disc space-y-1 pl-5 text-sm text-on-surface marker:text-on-surface-variant">
            {e.points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      ))}

      {topic.shortcuts && (
        <dl className="divide-y divide-outline-variant rounded-sm border border-outline-variant">
          {topic.shortcuts.map((s) => (
            <div key={s.action} className="flex items-center justify-between gap-4 px-3 py-2">
              <dt className="text-sm text-on-surface">{s.action}</dt>
              <dd className="flex shrink-0 flex-wrap justify-end gap-1">
                {s.keys.map((k) => (
                  <kbd
                    key={k}
                    className="rounded-sm border border-outline-variant bg-surface-container-lowest px-1.5 py-0.5 font-mono text-meta text-on-surface-variant"
                  >
                    {k}
                  </kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

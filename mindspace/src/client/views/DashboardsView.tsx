"use client";
import { useMemo, useState, type ReactNode } from "react";
import { Settings2 } from "lucide-react";
import type { Entity } from "@/core/model";
import {
  DEFAULT_DASHBOARD_CONFIG,
  financialDashboard,
  peopleDashboard,
  portfolioDashboard,
  resourceDashboard,
  type DashboardConfig,
  type Link,
  type Origin,
} from "@/core/queries";
import { useWorkspace } from "../store";
import { EntityIcon } from "../icons";
import { Chip, Empty, Popover, cn } from "../ui";

const CONFIG_KEY = "mindspace:dashboard-config:v1";
type Tab = "people" | "resources" | "financial" | "portfolio";
const TABS: Array<{ id: Tab; label: string }> = [
  { id: "people", label: "الأشخاص" },
  { id: "resources", label: "الموارد" },
  { id: "financial", label: "المالية" },
  { id: "portfolio", label: "المحفظة والاستراتيجية" },
];

function loadConfig(): DashboardConfig {
  try {
    return { ...DEFAULT_DASHBOARD_CONFIG, ...(JSON.parse(localStorage.getItem(CONFIG_KEY) ?? "{}") as Partial<DashboardConfig>) };
  } catch {
    return DEFAULT_DASHBOARD_CONFIG;
  }
}

/** Badge distinguishing data the user recorded from data the system derived. */
function OriginBadge({ origin, basis }: { origin: Origin; basis?: string[] }) {
  const set = useWorkspace((s) => s.set);
  const rels = useWorkspace((s) => s.snap.relationships);
  const ents = useWorkspace((s) => s.snap.entities);
  const types = useWorkspace((s) => s.snap.relationshipTypes);
  const badge = (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-px text-[10px] font-medium",
        origin === "recorded" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-sky-500/15 text-sky-700 dark:text-sky-300",
      )}
      title={origin === "recorded" ? "قيمة سجّلتها أنت" : "محسوبة من بياناتك المسجّلة"}
    >
      {origin === "recorded" ? "مسجّل" : "مشتق"}
      {basis && basis.length > 0 && ` · ${basis.length} علاقة`}
    </span>
  );
  if (!basis?.length) return badge;
  return (
    <Popover trigger={<button type="button">{badge}</button>}>
      <div className="w-72 p-1 text-xs">
        <div className="mb-1 px-1 font-semibold text-[var(--fg-muted)]">مبني على:</div>
        {basis.map((id) => {
          const r = rels[id];
          if (!r) return null;
          return (
            <button key={id} type="button" className="block w-full rounded px-1.5 py-1 text-start hover:bg-[var(--surface-2)]" onClick={() => set({ inspected: { kind: "relationship", id } })}>
              <span dir="auto">{ents[r.sourceId]?.title}</span> ← {types[r.typeId]?.name} ← <span dir="auto">{ents[r.targetId]?.title}</span>
            </button>
          );
        })}
      </div>
    </Popover>
  );
}

function EntityLink({ e }: { e: Entity }) {
  const set = useWorkspace((s) => s.set);
  const t = useWorkspace((s) => s.snap.entityTypes[e.typeId]);
  return (
    <button type="button" className="inline-flex min-w-0 items-center gap-1 font-medium hover:text-[var(--accent)]" onClick={() => set({ inspected: { kind: "entity", id: e.id } })}>
      <EntityIcon name={t?.icon ?? "circle"} color={t?.color} size={13} />
      <span dir="auto" className="truncate">
        {e.title || "بلا عنوان"}
      </span>
    </button>
  );
}

function Card({ title, children, testId, count }: { title: ReactNode; children: ReactNode; testId?: string; count?: number }) {
  return (
    <section data-testid={testId} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        {title}
        {count !== undefined && <span className="rounded-full bg-[var(--surface-2)] px-2 text-xs font-normal text-[var(--fg-muted)]">{count}</span>}
      </h3>
      {children}
    </section>
  );
}

function LinkRow({ l }: { l: Link }) {
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1 text-sm">
      <EntityLink e={l.entity} />
      <span dir="auto" className="text-[var(--fg-muted)]">
        — {l.role}
      </span>
      <Chip color={l.relationshipType?.visual.color}>{l.relationshipType?.name}</Chip>
      <OriginBadge origin={l.roleOrigin} basis={[l.relationship.id]} />
    </li>
  );
}

function EntityList({ items, empty }: { items: Entity[]; empty: string }) {
  if (!items.length) return <p className="text-xs text-[var(--fg-subtle)]">{empty}</p>;
  return (
    <ul className="space-y-1 text-sm">
      {items.map((e) => (
        <li key={e.id}>
          <EntityLink e={e} />
        </li>
      ))}
    </ul>
  );
}

const fmt = (n: number) => n.toLocaleString("en-US");

/**
 * Derived intelligence. Each dashboard is a live query over the knowledge
 * graph: it recomputes whenever the data changes, and every derived figure
 * links back to the relationships it rests on.
 */
export function DashboardsView() {
  const snap = useWorkspace((s) => s.snap);
  const [tab, setTab] = useState<Tab>("people");
  const [config, setConfig] = useState<DashboardConfig>(loadConfig);

  const people = useMemo(() => (tab === "people" ? peopleDashboard(snap, config) : null), [tab, snap, config]);
  const resources = useMemo(() => (tab === "resources" ? resourceDashboard(snap, config) : null), [tab, snap, config]);
  const financial = useMemo(() => (tab === "financial" ? financialDashboard(snap, config) : null), [tab, snap, config]);
  const portfolio = useMemo(() => (tab === "portfolio" ? portfolioDashboard(snap, config) : null), [tab, snap, config]);

  const updateConfig = (key: keyof DashboardConfig, typeKey: string) => {
    const cur = config[key];
    const next = { ...config, [key]: cur.includes(typeKey) ? cur.filter((k) => k !== typeKey) : [...cur, typeKey] };
    setConfig(next);
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };
  const roleNames: Array<[keyof DashboardConfig, string]> = [
    ["personTypeKeys", "أشخاص"],
    ["projectTypeKeys", "مشاريع"],
    ["resourceTypeKeys", "موارد"],
    ["financialTypeKeys", "عناصر مالية"],
    ["goalTypeKeys", "أهداف"],
    ["decisionTypeKeys", "قرارات"],
    ["riskTypeKeys", "مخاطر"],
    ["taskTypeKeys", "مهام"],
  ];
  const statusLabel = (v: string | null) => snap.workspace.settings.statuses.find((s) => s.value === v)?.label ?? "بلا حالة";

  return (
    <div className="ms-scroll h-full overflow-auto">
      <div className="sticky top-0 z-10 flex items-center gap-1 border-b border-[var(--border)] bg-[var(--bg)] px-4 py-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn("rounded-md px-3 py-1.5 text-sm", tab === t.id ? "bg-[var(--surface)] font-semibold shadow-sm" : "text-[var(--fg-muted)] hover:text-[var(--fg)]")}
          >
            {t.label}
          </button>
        ))}
        <Popover
          align="end"
          trigger={
            <button type="button" className="ms-auto flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--fg-muted)] hover:bg-[var(--surface-2)]">
              <Settings2 size={14} /> مصادر البيانات
            </button>
          }
        >
          <div className="w-80 space-y-2 p-2 text-xs">
            <p className="text-[var(--fg-muted)]">أي أنواع الكيانات تُعدّ «أشخاصاً» أو «مشاريع»… في هذه اللوحات؟</p>
            {roleNames.map(([key, label]) => (
              <div key={key}>
                <div className="mb-1 font-semibold">{label}</div>
                <div className="flex flex-wrap gap-1">
                  {Object.values(snap.entityTypes)
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => updateConfig(key, t.key)}
                        className={cn("rounded-full border px-2 py-0.5", config[key].includes(t.key) ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border)]")}
                      >
                        {t.name}
                      </button>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </Popover>
      </div>

      <div className="mx-auto grid max-w-6xl gap-4 p-4 lg:grid-cols-2">
        {people && (
          <>
            <Card title="الأشخاص وأدوارهم" count={people.people.length} testId="people-dashboard">
              {people.people.length === 0 ? (
                <Empty title="لا يوجد أشخاص مسجّلون" />
              ) : (
                <ul className="divide-y divide-[var(--border)]">
                  {people.people.map((p) => (
                    <li key={p.person.id} className="py-2" data-testid="person-row">
                      <div className="flex items-center gap-2">
                        <EntityLink e={p.person} />
                        <span className="text-xs text-[var(--fg-muted)]">
                          في {p.projectCount} {p.projectCount === 1 ? "مشروع" : "مشاريع"}
                        </span>
                        {p.sharedAcrossProjects && <OriginBadge origin="derived" />}
                        {p.sharedAcrossProjects && <Chip color="#7c3aed">مشترك بين عدة مشاريع</Chip>}
                      </div>
                      <ul className="ms-5 mt-1">
                        {p.links.map((l) => (
                          <LinkRow key={l.relationship.id} l={l} />
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <div className="space-y-4">
              <Card title={<>مشاريع بلا أشخاص مرتبطين <OriginBadge origin="derived" /></>} count={people.projectsWithoutPeople.length}>
                <EntityList items={people.projectsWithoutPeople} empty="كل المشاريع لها أشخاص مرتبطون." />
              </Card>
              <Card title={<>علاقات ينبغي متابعتها: دور غير محدد <OriginBadge origin="derived" /></>} count={people.linksMissingRole.length}>
                {people.linksMissingRole.length === 0 ? (
                  <p className="text-xs text-[var(--fg-subtle)]">كل الارتباطات لها دور مسجّل.</p>
                ) : (
                  <ul className="text-sm">
                    {people.linksMissingRole.map(({ person, link }) => (
                      <li key={link.relationship.id} className="flex items-center gap-2 py-1">
                        <EntityLink e={person} /> ← <EntityLink e={link.entity} />
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </>
        )}

        {resources && (
          <>
            <Card title="الموارد ومن يحتاجها" count={resources.resources.length} testId="resources-dashboard">
              {resources.resources.length === 0 ? (
                <Empty title="لا توجد موارد مسجّلة" />
              ) : (
                <ul className="divide-y divide-[var(--border)]">
                  {resources.resources.map((r) => {
                    const availability = Object.values(snap.fields).find((f) => f.entityTypeId === r.resource.typeId && f.key === "availability");
                    const avLabel = availability?.options.choices?.find((c) => c.value === r.availability)?.label;
                    return (
                      <li key={r.resource.id} className="py-2" data-testid="resource-row">
                        <div className="flex items-center gap-2">
                          <EntityLink e={r.resource} />
                          {avLabel && <Chip>{avLabel}</Chip>}
                          {r.shared && <Chip color="#ea580c">مورد مشترك ({r.consumers.length})</Chip>}
                        </div>
                        <ul className="ms-5 mt-1">
                          {r.consumers.map((c) => (
                            <li key={c.relationship.id} className="flex items-center gap-2 py-0.5 text-sm">
                              <EntityLink e={c.entity} />
                              {c.requirement && <span className="text-xs text-[var(--fg-muted)]">— {requirementLabel(c.requirement)}</span>}
                              <OriginBadge origin="recorded" basis={[c.relationship.id]} />
                            </li>
                          ))}
                          {r.consumers.length === 0 && <li className="text-xs text-[var(--fg-subtle)]">غير مرتبط بأي مشروع.</li>}
                        </ul>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
            <Card title={<>احتياجات غير مغطاة <OriginBadge origin="derived" /></>} count={resources.uncovered.length}>
              <p className="mb-2 text-xs text-[var(--fg-muted)]">احتياج مسجّل بحالة «مطلوب» لمورد غير مسجّل أنه «متاح».</p>
              {resources.uncovered.length === 0 ? (
                <p className="text-xs text-[var(--fg-subtle)]">لا توجد احتياجات معلّقة.</p>
              ) : (
                <ul className="text-sm">
                  {resources.uncovered.map((u) => (
                    <li key={u.relationship.id} className="flex items-center gap-2 py-1">
                      <EntityLink e={u.consumer} /> يحتاج <EntityLink e={u.resource} />
                      <OriginBadge origin="derived" basis={[u.relationship.id]} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        )}

        {financial && (
          <>
            <Card title="العناصر المالية" count={financial.items.length} testId="financial-dashboard">
              {financial.totals.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {financial.totals.map((t) => (
                    <div key={`${t.kind}|${t.currency}`} className="rounded-lg bg-[var(--surface-2)] px-3 py-2">
                      <div className="text-[11px] text-[var(--fg-muted)]">
                        إجمالي {kindLabel(snap, t.kind) || "غير مصنّف"} <OriginBadge origin="derived" />
                      </div>
                      <div className="text-lg font-bold tabular-nums" dir="ltr">
                        {fmt(t.total)} {t.currency}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {financial.items.length === 0 ? (
                <Empty title="لا توجد عناصر مالية" />
              ) : (
                <ul className="divide-y divide-[var(--border)]">
                  {financial.items.map((it) => (
                    <li key={it.item.id} className="py-2" data-testid="financial-row">
                      <div className="flex flex-wrap items-center gap-2">
                        <EntityLink e={it.item} />
                        {it.amount !== null && (
                          <span className="text-sm tabular-nums" dir="ltr">
                            {fmt(it.amount)} {it.currency}
                          </span>
                        )}
                        {it.kind && <Chip>{kindLabel(snap, it.kind)}</Chip>}
                      </div>
                      <ul className="ms-5 mt-1">
                        {it.links.map((l) => (
                          <li key={l.relationship.id} className="flex flex-wrap items-center gap-2 py-0.5 text-sm">
                            ← <EntityLink e={l.entity} />
                            {l.amount !== null && (
                              <span className="tabular-nums text-[var(--fg-muted)]" dir="ltr">
                                {fmt(l.amount)} {l.currency}
                              </span>
                            )}
                            {l.commitment && <Chip>{commitmentLabel(snap, l.commitment)}</Chip>}
                            <OriginBadge origin="recorded" basis={[l.relationship.id]} />
                          </li>
                        ))}
                        {it.links.length === 0 && <li className="text-xs text-[var(--fg-subtle)]">غير مرتبط بأي كيان.</li>}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <div className="space-y-4">
              <Card title={<>فجوات تمويلية <OriginBadge origin="derived" /></>} count={financial.fundingGaps.length}>
                <p className="mb-2 text-xs text-[var(--fg-muted)]">الميزانية المسجّلة في المشروع أكبر من مجموع العلاقات المالية المرتبطة به.</p>
                {financial.fundingGaps.length === 0 ? (
                  <p className="text-xs text-[var(--fg-subtle)]">لا توجد فجوات وفق البيانات المسجّلة.</p>
                ) : (
                  <ul className="text-sm">
                    {financial.fundingGaps.map((g) => (
                      <li key={g.project.id} className="flex flex-wrap items-center gap-2 py-1">
                        <EntityLink e={g.project} />
                        <span className="tabular-nums text-[var(--fg-muted)]" dir="ltr">
                          {fmt(g.linked)} / {fmt(g.budget)}
                        </span>
                        <Chip color="#dc2626">فجوة {fmt(g.gap)}</Chip>
                        <OriginBadge origin="derived" basis={g.basis} />
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              <Card title={<>مشاريع بلا علاقات مالية <OriginBadge origin="derived" /></>} count={financial.projectsWithoutFinancials.length}>
                <EntityList items={financial.projectsWithoutFinancials} empty="كل المشاريع لها علاقات مالية." />
              </Card>
            </div>
          </>
        )}

        {portfolio && (
          <>
            <Card title="المشاريع حسب الحالة">
              {portfolio.projectsByStatus.length === 0 ? (
                <Empty title="لا توجد مشاريع" />
              ) : (
                <div className="space-y-3">
                  {portfolio.projectsByStatus.map((g) => (
                    <div key={g.status ?? "none"}>
                      <div className="mb-1 text-xs font-semibold text-[var(--fg-muted)]">
                        {statusLabel(g.status)} ({g.projects.length})
                      </div>
                      <EntityList items={g.projects} empty="" />
                    </div>
                  ))}
                </div>
              )}
            </Card>
            <Card title={<>اعتماديات حرجة <OriginBadge origin="derived" /></>} count={portfolio.criticalDependencies.length}>
              {portfolio.criticalDependencies.length === 0 ? (
                <p className="text-xs text-[var(--fg-subtle)]">لا يوجد عنصر يعتمد عليه عنصران أو أكثر.</p>
              ) : (
                <ul className="text-sm">
                  {portfolio.criticalDependencies.map((d) => (
                    <li key={d.entity.id} className="flex flex-wrap items-center gap-2 py-1">
                      <EntityLink e={d.entity} /> يعتمد عليه {d.dependents.length}
                      <OriginBadge origin="derived" basis={d.basis} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title={<>عناصر متأخرة <OriginBadge origin="derived" /></>} count={portfolio.overdue.length}>
              <EntityList items={portfolio.overdue} empty="لا توجد عناصر تجاوزت تاريخ استحقاقها." />
            </Card>
            <Card title="المخاطر المسجّلة" count={portfolio.risks.length}>
              <EntityList items={portfolio.risks} empty="لا توجد مخاطر مسجّلة." />
            </Card>
            <Card title={<>أهداف بلا مشاريع تنفيذية <OriginBadge origin="derived" /></>} count={portfolio.goalsWithoutProjects.length}>
              <EntityList items={portfolio.goalsWithoutProjects} empty="كل الأهداف مرتبطة بمشاريع." />
            </Card>
            <Card title={<>مشاريع غير مرتبطة بأهداف <OriginBadge origin="derived" /></>} count={portfolio.projectsWithoutGoals.length}>
              <EntityList items={portfolio.projectsWithoutGoals} empty="كل المشاريع مرتبطة بأهداف." />
            </Card>
            <Card title="قرارات مفتوحة" count={portfolio.openDecisions.length}>
              <EntityList items={portfolio.openDecisions} empty="لا توجد قرارات معلّقة." />
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

function requirementLabel(v: string) {
  return { needed: "مطلوب", allocated: "مخصص", in_use: "مستخدم" }[v] ?? v;
}

function choiceLabel(snap: ReturnType<typeof useWorkspace.getState>["snap"], key: string, value: string, rel: boolean) {
  for (const f of Object.values(snap.fields)) {
    if (f.key !== key || (rel ? !f.relationshipTypeId : !f.entityTypeId)) continue;
    const c = f.options.choices?.find((x) => x.value === value);
    if (c) return c.label;
  }
  return value;
}
const kindLabel = (snap: ReturnType<typeof useWorkspace.getState>["snap"], v: string) => (v ? choiceLabel(snap, "kind", v, false) : "");
const commitmentLabel = (snap: ReturnType<typeof useWorkspace.getState>["snap"], v: string) => choiceLabel(snap, "commitment", v, true);

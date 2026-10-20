/**
 * Default presets: starting configuration, never constraints.
 * Every type, field and relationship below can be renamed, recoloured,
 * extended or deleted from the settings screen. Code refers to them only
 * through their stable `key`.
 */
import {
  type Choice,
  type EdgeVisual,
  type EntityType,
  type FieldDataType,
  type FieldDefinition,
  type FieldOptions,
  type RelationshipCategory,
  type RelationshipType,
  type WorkspaceSettings,
  newId,
} from "./model";
import type { Op } from "./ops";

export const DEFAULT_SETTINGS: WorkspaceSettings = {
  statuses: [
    { value: "idea", label: "فكرة", color: "#a78bfa" },
    { value: "planned", label: "مخطط", color: "#60a5fa" },
    { value: "active", label: "نشط", color: "#34d399" },
    { value: "paused", label: "متوقف", color: "#fbbf24" },
    { value: "blocked", label: "معطّل", color: "#f87171" },
    { value: "done", label: "منجز", color: "#94a3b8" },
  ],
  priorities: [
    { value: "low", label: "منخفضة", color: "#94a3b8" },
    { value: "medium", label: "متوسطة", color: "#60a5fa" },
    { value: "high", label: "عالية", color: "#f59e0b" },
    { value: "critical", label: "حرجة", color: "#ef4444" },
  ],
};

type FieldPreset = { key: string; label: string; dataType: FieldDataType; options?: FieldOptions };

interface EntityTypePreset {
  key: string;
  name: string;
  nameEn: string;
  icon: string;
  color: string;
  fields?: FieldPreset[];
}

const choices = (...pairs: Array<[string, string]>): FieldOptions => ({
  choices: pairs.map(([value, label]): Choice => ({ value, label })),
});

export const ENTITY_TYPE_PRESETS: EntityTypePreset[] = [
  { key: "dimension", name: "بُعد", nameEn: "Dimension", icon: "orbit", color: "#7c3aed" },
  { key: "domain", name: "مجال", nameEn: "Domain", icon: "globe", color: "#2563eb" },
  { key: "program", name: "برنامج", nameEn: "Program", icon: "layers", color: "#0891b2" },
  {
    key: "project",
    name: "مشروع",
    nameEn: "Project",
    icon: "folder-kanban",
    color: "#059669",
    fields: [{ key: "budget", label: "الميزانية", dataType: "currency", options: { currency: "SAR" } }],
  },
  {
    key: "task",
    name: "مهمة",
    nameEn: "Task",
    icon: "square-check",
    color: "#65a30d",
    fields: [{ key: "progress", label: "نسبة الإنجاز", dataType: "percent" }],
  },
  {
    key: "person",
    name: "شخص",
    nameEn: "Person",
    icon: "user",
    color: "#db2777",
    fields: [
      { key: "email", label: "البريد", dataType: "text" },
      { key: "phone", label: "الجوال", dataType: "text" },
      { key: "expertise", label: "الخبرة", dataType: "text" },
    ],
  },
  {
    key: "organization",
    name: "منظمة",
    nameEn: "Organization",
    icon: "building-2",
    color: "#9333ea",
    fields: [{ key: "website", label: "الموقع", dataType: "url" }],
  },
  {
    key: "resource",
    name: "مورد",
    nameEn: "Resource",
    icon: "package",
    color: "#ea580c",
    fields: [
      {
        key: "availability",
        label: "التوفر",
        dataType: "select",
        options: choices(["available", "متاح"], ["limited", "محدود"], ["unavailable", "غير متاح"]),
      },
    ],
  },
  {
    key: "financial",
    name: "عنصر مالي",
    nameEn: "Financial Item",
    icon: "banknote",
    color: "#ca8a04",
    fields: [
      { key: "amount", label: "المبلغ", dataType: "currency", options: { currency: "SAR" } },
      {
        key: "kind",
        label: "النوع",
        dataType: "select",
        options: choices(["budget", "ميزانية"], ["expense", "مصروف"], ["commitment", "التزام"], ["funding", "تمويل"]),
      },
    ],
  },
  {
    key: "goal",
    name: "هدف",
    nameEn: "Goal",
    icon: "target",
    color: "#dc2626",
    fields: [{ key: "metric", label: "مؤشر القياس", dataType: "text" }],
  },
  { key: "idea", name: "فكرة", nameEn: "Idea", icon: "lightbulb", color: "#f59e0b" },
  {
    key: "decision",
    name: "قرار",
    nameEn: "Decision",
    icon: "scale",
    color: "#4f46e5",
    fields: [
      { key: "question", label: "القرار المطلوب", dataType: "longText" },
      { key: "options", label: "الخيارات المتاحة", dataType: "longText" },
      { key: "criteria", label: "معايير المقارنة", dataType: "longText" },
      { key: "evidence", label: "الأدلة", dataType: "longText" },
      { key: "assumptions", label: "الافتراضات", dataType: "longText" },
      { key: "estimatedCost", label: "التكلفة التقديرية", dataType: "currency", options: { currency: "SAR" } },
      { key: "finalDecision", label: "القرار النهائي", dataType: "longText" },
      { key: "rationale", label: "المبررات", dataType: "longText" },
    ],
  },
  {
    key: "risk",
    name: "مخاطرة",
    nameEn: "Risk",
    icon: "triangle-alert",
    color: "#e11d48",
    fields: [
      {
        key: "likelihood",
        label: "الاحتمال",
        dataType: "select",
        options: choices(["low", "منخفض"], ["medium", "متوسط"], ["high", "مرتفع"]),
      },
      {
        key: "impact",
        label: "الأثر",
        dataType: "select",
        options: choices(["low", "منخفض"], ["medium", "متوسط"], ["high", "مرتفع"]),
      },
    ],
  },
  { key: "milestone", name: "مرحلة", nameEn: "Milestone", icon: "flag", color: "#0d9488" },
  {
    key: "agent",
    name: "وكيل ذكاء اصطناعي",
    nameEn: "AI Agent",
    icon: "bot",
    color: "#475569",
    fields: [{ key: "role", label: "الدور", dataType: "text" }],
  },
  { key: "note", name: "ملاحظة", nameEn: "Note", icon: "sticky-note", color: "#78716c" },
];

interface RelationshipTypePreset {
  key: string;
  category: RelationshipCategory;
  name: string;
  nameEn: string;
  inverseName: string;
  color: string;
  dash?: EdgeVisual["dash"];
  curve?: EdgeVisual["curve"];
  directed?: boolean;
  fields?: FieldPreset[];
}

const roleFields: FieldPreset[] = [
  { key: "role", label: "الدور", dataType: "text" },
  { key: "contribution", label: "طبيعة المساهمة", dataType: "text" },
];

export const RELATIONSHIP_TYPE_PRESETS: RelationshipTypePreset[] = [
  { key: "hierarchical", category: "hierarchical", name: "تابع لـ", nameEn: "Part of", inverseName: "يضم", color: "#64748b", curve: "step" },
  {
    key: "financial",
    category: "financial",
    name: "علاقة مالية",
    nameEn: "Financial",
    inverseName: "مموَّل من",
    color: "#ca8a04",
    fields: [
      { key: "amount", label: "القيمة", dataType: "number" },
      { key: "currency", label: "العملة", dataType: "text" },
      {
        key: "commitment",
        label: "نوع الالتزام",
        dataType: "select",
        options: choices(["planned", "مخطط"], ["committed", "ملتزم به"], ["paid", "مدفوع"], ["funding", "مصدر تمويل"]),
      },
    ],
  },
  {
    key: "execution",
    category: "execution",
    name: "تنفيذ",
    nameEn: "Execution",
    inverseName: "يُنفَّذ بواسطة",
    color: "#059669",
    fields: [
      { key: "role", label: "الدور", dataType: "text" },
      { key: "progress", label: "نسبة الإنجاز", dataType: "percent" },
    ],
  },
  { key: "dependency", category: "dependency", name: "يعتمد على", nameEn: "Depends on", inverseName: "تعتمد عليه", color: "#dc2626", dash: "dashed" },
  { key: "people", category: "people", name: "علاقة شخص", nameEn: "Person relation", inverseName: "يرتبط به", color: "#db2777", fields: roleFields },
  {
    key: "resource",
    category: "resource",
    name: "يحتاج المورد",
    nameEn: "Requires resource",
    inverseName: "مطلوب لـ",
    color: "#ea580c",
    dash: "dashed",
    fields: [
      {
        key: "requirement",
        label: "حالة الاحتياج",
        dataType: "select",
        options: choices(["needed", "مطلوب"], ["allocated", "مخصص"], ["in_use", "مستخدم"]),
      },
    ],
  },
  { key: "ownership", category: "ownership", name: "مسؤول عن", nameEn: "Responsible for", inverseName: "مسؤوليته على", color: "#7c3aed", fields: roleFields },
  { key: "strategic", category: "strategic", name: "يخدم الهدف", nameEn: "Serves goal", inverseName: "يتحقق عبر", color: "#2563eb" },
  { key: "information", category: "information", name: "مرجع معلوماتي", nameEn: "Information", inverseName: "مرجع لـ", color: "#0891b2", dash: "dotted" },
  { key: "ai", category: "ai", name: "علاقة ذكاء اصطناعي", nameEn: "AI", inverseName: "مدعوم بـ", color: "#475569", dash: "dotted" },
  { key: "influence", category: "influence", name: "يؤثر في", nameEn: "Influences", inverseName: "يتأثر بـ", color: "#f43f5e", curve: "bezier" },
  { key: "custom", category: "custom", name: "مرتبط بـ", nameEn: "Related", inverseName: "مرتبط بـ", color: "#94a3b8", directed: false },
];

function field(owner: { entityTypeId?: string; relationshipTypeId?: string }, f: FieldPreset, i: number): FieldDefinition {
  return {
    id: newId(),
    entityTypeId: owner.entityTypeId ?? null,
    relationshipTypeId: owner.relationshipTypeId ?? null,
    key: f.key,
    label: f.label,
    dataType: f.dataType,
    options: f.options ?? {},
    sortOrder: i,
  };
}

/** Ops that install every preset type and field into an empty workspace. */
export function presetOps(): Op[] {
  const ops: Op[] = [];
  ENTITY_TYPE_PRESETS.forEach((p, i) => {
    const type: EntityType = {
      id: newId(),
      key: p.key,
      name: p.name,
      nameEn: p.nameEn,
      icon: p.icon,
      color: p.color,
      description: "",
      sortOrder: i,
    };
    ops.push({ op: "create", kind: "entityType", value: type });
    p.fields?.forEach((f, j) => ops.push({ op: "create", kind: "field", value: field({ entityTypeId: type.id }, f, j) }));
  });
  RELATIONSHIP_TYPE_PRESETS.forEach((p, i) => {
    const type: RelationshipType = {
      id: newId(),
      key: p.key,
      category: p.category,
      name: p.name,
      nameEn: p.nameEn,
      inverseName: p.inverseName,
      description: "",
      directed: p.directed ?? true,
      visual: {
        color: p.color,
        width: 1.75,
        dash: p.dash ?? "solid",
        curve: p.curve ?? "bezier",
        arrow: p.directed === false ? "none" : "arrowclosed",
        opacity: 1,
        showLabel: true,
      },
      sortOrder: i,
    };
    ops.push({ op: "create", kind: "relationshipType", value: type });
    p.fields?.forEach((f, j) =>
      ops.push({ op: "create", kind: "field", value: field({ relationshipTypeId: type.id }, f, j) }),
    );
  });
  return ops;
}

/** Default entity type key for quick capture (no classification needed up front). */
export const QUICK_CAPTURE_TYPE_KEY = "idea";

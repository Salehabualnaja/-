/**
 * MINDSPACE domain model.
 *
 * Three layers are kept strictly apart (see ARCHITECTURE.md):
 *  1. Semantic data      — EntityType, FieldDefinition, Entity, RelationshipType, Relationship.
 *  2. Presentation data  — Canvas, Placement, Annotation, and the `visual` blocks.
 *  3. View configuration — SavedView, Dashboard (later phases).
 *
 * Moving a card edits a Placement only. Changing a line's colour edits a `visual`
 * block only. Neither ever touches the meaning stored in Entity / Relationship.
 */
import { z } from "zod";

export const Id = z.string().min(1).max(64);
export type Id = z.infer<typeof Id>;

const IsoDateTime = z.string();
/** Calendar date `YYYY-MM-DD` or null. */
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();
const Json = z.record(z.string(), z.unknown());

// ---------------------------------------------------------------------------
// Fields (schema-driven UI)
// ---------------------------------------------------------------------------

export const FIELD_DATA_TYPES = [
  "text",
  "longText",
  "number",
  "currency",
  "percent",
  "date",
  "select",
  "multiSelect",
  "checkbox",
  "url",
] as const;
export const FieldDataType = z.enum(FIELD_DATA_TYPES);
export type FieldDataType = z.infer<typeof FieldDataType>;

export const Choice = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
  color: z.string().optional(),
});
export type Choice = z.infer<typeof Choice>;

export const FieldOptions = z.object({
  choices: z.array(Choice).optional(),
  currency: z.string().optional(),
});
export type FieldOptions = z.infer<typeof FieldOptions>;

/**
 * A user-defined field. Belongs either to an entity type or to a relationship
 * type (exactly one of the two ids is set).
 */
export const FieldDefinition = z.object({
  id: Id,
  entityTypeId: Id.nullable(),
  relationshipTypeId: Id.nullable(),
  key: z.string().min(1).max(64),
  label: z.string().min(1).max(120),
  dataType: FieldDataType,
  options: FieldOptions,
  sortOrder: z.number(),
});
export type FieldDefinition = z.infer<typeof FieldDefinition>;

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------

export const WorkspaceSettings = z.object({
  statuses: z.array(Choice),
  priorities: z.array(Choice),
});
export type WorkspaceSettings = z.infer<typeof WorkspaceSettings>;

export const Workspace = z.object({
  id: Id,
  name: z.string(),
  settings: WorkspaceSettings,
});
export type Workspace = z.infer<typeof Workspace>;

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

export const EntityType = z.object({
  id: Id,
  /** Stable machine key. Survives renames; presets and dashboards refer to it. */
  key: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  nameEn: z.string().max(120),
  icon: z.string().max(64),
  color: z.string().max(32),
  description: z.string(),
  sortOrder: z.number(),
});
export type EntityType = z.infer<typeof EntityType>;

export const Entity = z.object({
  id: Id,
  typeId: Id,
  title: z.string().max(500),
  description: z.string(),
  /** Detailed body (Markdown for now; rich text editor in Phase 4). */
  content: z.string(),
  status: z.string().nullable(),
  priority: z.string().nullable(),
  tags: z.array(z.string()),
  /** Values of custom fields, keyed by FieldDefinition.key. */
  properties: Json,
  startDate: IsoDate,
  dueDate: IsoDate,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Entity = z.infer<typeof Entity>;

// ---------------------------------------------------------------------------
// Relationships
// ---------------------------------------------------------------------------

export const EDGE_CURVES = ["bezier", "straight", "step"] as const;
export const EDGE_DASHES = ["solid", "dashed", "dotted"] as const;
export const EDGE_ARROWS = ["arrow", "arrowclosed", "none"] as const;

/** Purely visual description of a line. Never carries meaning. */
export const EdgeVisual = z.object({
  color: z.string(),
  width: z.number().min(0.5).max(12),
  dash: z.enum(EDGE_DASHES),
  curve: z.enum(EDGE_CURVES),
  arrow: z.enum(EDGE_ARROWS),
  opacity: z.number().min(0.05).max(1),
  showLabel: z.boolean(),
});
export type EdgeVisual = z.infer<typeof EdgeVisual>;

export const RELATIONSHIP_CATEGORIES = [
  "hierarchical",
  "financial",
  "execution",
  "dependency",
  "people",
  "resource",
  "ownership",
  "strategic",
  "information",
  "ai",
  "influence",
  "custom",
] as const;
export const RelationshipCategory = z.enum(RELATIONSHIP_CATEGORIES);
export type RelationshipCategory = z.infer<typeof RelationshipCategory>;

export const RelationshipType = z.object({
  id: Id,
  key: z.string().min(1).max(64),
  /** Semantic family. Analyses (impact, dashboards) read this, never the colour. */
  category: RelationshipCategory,
  name: z.string().min(1).max(120),
  nameEn: z.string().max(120),
  /** Reading of the relation from target to source, e.g. "يضم" for "تابع لـ". */
  inverseName: z.string().max(120),
  description: z.string(),
  directed: z.boolean(),
  /** Default look of relations of this type. */
  visual: EdgeVisual,
  sortOrder: z.number(),
});
export type RelationshipType = z.infer<typeof RelationshipType>;

export const RELATIONSHIP_DIRECTIONS = ["forward", "both", "none"] as const;
export const RelationshipDirection = z.enum(RELATIONSHIP_DIRECTIONS);
export type RelationshipDirection = z.infer<typeof RelationshipDirection>;

export const Relationship = z.object({
  id: Id,
  typeId: Id,
  sourceId: Id,
  targetId: Id,
  direction: RelationshipDirection,
  label: z.string().max(200),
  description: z.string(),
  status: z.string().nullable(),
  /** Strength 0..1, null when unknown. */
  weight: z.number().min(0).max(1).nullable(),
  date: IsoDate,
  properties: Json,
  /** Presentation override of the type's default visual. Not semantic. */
  visual: EdgeVisual.partial().nullable(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Relationship = z.infer<typeof Relationship>;

// ---------------------------------------------------------------------------
// Presentation: canvases, placements, annotations
// ---------------------------------------------------------------------------

export const Viewport = z.object({ x: z.number(), y: z.number(), zoom: z.number().positive() });
export type Viewport = z.infer<typeof Viewport>;

export const Canvas = z.object({
  id: Id,
  name: z.string().min(1).max(120),
  viewport: Viewport,
  sortOrder: z.number(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Canvas = z.infer<typeof Canvas>;

export const CARD_VARIANTS = ["card", "pill", "note"] as const;
export const PlacementStyle = z.object({
  color: z.string().optional(),
  variant: z.enum(CARD_VARIANTS).optional(),
});
export type PlacementStyle = z.infer<typeof PlacementStyle>;

/** One appearance of an entity on one canvas. Deleting it never deletes the entity. */
export const Placement = z.object({
  id: Id,
  canvasId: Id,
  entityId: Id,
  x: z.number(),
  y: z.number(),
  width: z.number().positive().nullable(),
  height: z.number().positive().nullable(),
  style: PlacementStyle,
  collapsed: z.boolean(),
  z: z.number(),
});
export type Placement = z.infer<typeof Placement>;

export const ANNOTATION_KINDS = ["sticky", "text", "frame"] as const;
export const AnnotationKind = z.enum(ANNOTATION_KINDS);
export type AnnotationKind = z.infer<typeof AnnotationKind>;

/** Canvas-only content with no semantic meaning (sticky notes, text, frames). */
export const Annotation = z.object({
  id: Id,
  canvasId: Id,
  kind: AnnotationKind,
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  text: z.string(),
  style: z.object({ color: z.string().optional() }),
  z: z.number(),
});
export type Annotation = z.infer<typeof Annotation>;

// ---------------------------------------------------------------------------
// Snapshot: the whole workspace held in memory by the client
// ---------------------------------------------------------------------------

export interface Snapshot {
  workspace: Workspace;
  entityTypes: Record<Id, EntityType>;
  fields: Record<Id, FieldDefinition>;
  relationshipTypes: Record<Id, RelationshipType>;
  entities: Record<Id, Entity>;
  relationships: Record<Id, Relationship>;
  canvases: Record<Id, Canvas>;
  placements: Record<Id, Placement>;
  annotations: Record<Id, Annotation>;
}

export function emptySnapshot(workspace: Workspace): Snapshot {
  return {
    workspace,
    entityTypes: {},
    fields: {},
    relationshipTypes: {},
    entities: {},
    relationships: {},
    canvases: {},
    placements: {},
    annotations: {},
  };
}

// ---------------------------------------------------------------------------
// Factories with safe defaults
// ---------------------------------------------------------------------------

export function newId(): string {
  return globalThis.crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function makeEntity(input: Pick<Entity, "typeId"> & Partial<Entity>): Entity {
  const at = input.createdAt ?? nowIso();
  return {
    id: input.id ?? newId(),
    typeId: input.typeId,
    title: input.title ?? "",
    description: input.description ?? "",
    content: input.content ?? "",
    status: input.status ?? null,
    priority: input.priority ?? null,
    tags: input.tags ?? [],
    properties: input.properties ?? {},
    startDate: input.startDate ?? null,
    dueDate: input.dueDate ?? null,
    createdAt: at,
    updatedAt: input.updatedAt ?? at,
  };
}

export function makeRelationship(
  input: Pick<Relationship, "typeId" | "sourceId" | "targetId"> & Partial<Relationship>,
): Relationship {
  const at = input.createdAt ?? nowIso();
  return {
    id: input.id ?? newId(),
    typeId: input.typeId,
    sourceId: input.sourceId,
    targetId: input.targetId,
    direction: input.direction ?? "forward",
    label: input.label ?? "",
    description: input.description ?? "",
    status: input.status ?? null,
    weight: input.weight ?? null,
    date: input.date ?? null,
    properties: input.properties ?? {},
    visual: input.visual ?? null,
    createdAt: at,
    updatedAt: input.updatedAt ?? at,
  };
}

export function makePlacement(
  input: Pick<Placement, "canvasId" | "entityId" | "x" | "y"> & Partial<Placement>,
): Placement {
  return {
    id: input.id ?? newId(),
    canvasId: input.canvasId,
    entityId: input.entityId,
    x: input.x,
    y: input.y,
    width: input.width ?? null,
    height: input.height ?? null,
    style: input.style ?? {},
    collapsed: input.collapsed ?? false,
    z: input.z ?? 0,
  };
}

export function makeCanvas(input: Partial<Canvas> & Pick<Canvas, "name">): Canvas {
  const at = input.createdAt ?? nowIso();
  return {
    id: input.id ?? newId(),
    name: input.name,
    viewport: input.viewport ?? { x: 0, y: 0, zoom: 1 },
    sortOrder: input.sortOrder ?? 0,
    createdAt: at,
    updatedAt: input.updatedAt ?? at,
  };
}

export function makeAnnotation(
  input: Pick<Annotation, "canvasId" | "kind" | "x" | "y"> & Partial<Annotation>,
): Annotation {
  const size =
    input.kind === "frame" ? { w: 480, h: 320 } : input.kind === "sticky" ? { w: 200, h: 160 } : { w: 260, h: 60 };
  return {
    id: input.id ?? newId(),
    canvasId: input.canvasId,
    kind: input.kind,
    x: input.x,
    y: input.y,
    width: input.width ?? size.w,
    height: input.height ?? size.h,
    text: input.text ?? "",
    style: input.style ?? {},
    z: input.z ?? (input.kind === "frame" ? -1 : 0),
  };
}

/** Effective visual of a relationship: type default overlaid with the per-relation override. */
export function effectiveVisual(rel: Relationship, type: RelationshipType | undefined): EdgeVisual {
  const base: EdgeVisual = type?.visual ?? {
    color: "#64748b",
    width: 1.5,
    dash: "solid",
    curve: "bezier",
    arrow: "arrowclosed",
    opacity: 1,
    showLabel: true,
  };
  return { ...base, ...(rel.visual ?? {}) } as EdgeVisual;
}

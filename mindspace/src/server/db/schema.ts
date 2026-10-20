/**
 * PostgreSQL schema (Drizzle). Column names in TypeScript mirror the domain
 * model in `src/core/model.ts`, so rows map to records with almost no glue.
 *
 * Semantic tables:      entity_types, field_definitions, entities, relationship_types, relationships
 * Presentation tables:  canvases, canvas_placements, canvas_annotations
 * View configuration:   saved_views, dashboards, dashboard_widgets   (used from Phase 3)
 * Infrastructure:       workspaces, attachments, change_events, op_batches
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => ts("created_at").notNull().defaultNow();
const updatedAt = () => ts("updated_at").notNull().defaultNow();

export const workspaces = pgTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  settings: jsonb("settings").notNull().default({}),
  createdAt: createdAt(),
});

const workspaceId = () =>
  text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" });

// ---------------------------------------------------------------------------
// Semantic data
// ---------------------------------------------------------------------------

export const entityTypes = pgTable(
  "entity_types",
  {
    id: text("id").primaryKey(),
    workspaceId: workspaceId(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    nameEn: text("name_en").notNull().default(""),
    icon: text("icon").notNull().default(""),
    color: text("color").notNull().default(""),
    description: text("description").notNull().default(""),
    sortOrder: doublePrecision("sort_order").notNull().default(0),
  },
  (t) => [index("entity_types_ws_idx").on(t.workspaceId)],
);

export const relationshipTypes = pgTable(
  "relationship_types",
  {
    id: text("id").primaryKey(),
    workspaceId: workspaceId(),
    key: text("key").notNull(),
    category: text("category").notNull(),
    name: text("name").notNull(),
    nameEn: text("name_en").notNull().default(""),
    inverseName: text("inverse_name").notNull().default(""),
    description: text("description").notNull().default(""),
    directed: boolean("directed").notNull().default(true),
    visual: jsonb("visual").notNull(),
    sortOrder: doublePrecision("sort_order").notNull().default(0),
  },
  (t) => [index("relationship_types_ws_idx").on(t.workspaceId)],
);

export const fieldDefinitions = pgTable(
  "field_definitions",
  {
    id: text("id").primaryKey(),
    workspaceId: workspaceId(),
    entityTypeId: text("entity_type_id").references(() => entityTypes.id, { onDelete: "cascade" }),
    relationshipTypeId: text("relationship_type_id").references(() => relationshipTypes.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    label: text("label").notNull(),
    dataType: text("data_type").notNull(),
    options: jsonb("options").notNull().default({}),
    sortOrder: doublePrecision("sort_order").notNull().default(0),
  },
  (t) => [
    index("field_definitions_ws_idx").on(t.workspaceId),
    check(
      "field_definitions_one_owner",
      sql`(${t.entityTypeId} is null) <> (${t.relationshipTypeId} is null)`,
    ),
  ],
);

export const entities = pgTable(
  "entities",
  {
    id: text("id").primaryKey(),
    workspaceId: workspaceId(),
    typeId: text("type_id")
      .notNull()
      .references(() => entityTypes.id, { onDelete: "restrict" }),
    title: text("title").notNull().default(""),
    description: text("description").notNull().default(""),
    content: text("content").notNull().default(""),
    status: text("status"),
    priority: text("priority"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    properties: jsonb("properties").notNull().default({}),
    startDate: date("start_date", { mode: "string" }),
    dueDate: date("due_date", { mode: "string" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("entities_ws_type_idx").on(t.workspaceId, t.typeId),
    index("entities_ws_updated_idx").on(t.workspaceId, t.updatedAt),
  ],
);

export const relationships = pgTable(
  "relationships",
  {
    id: text("id").primaryKey(),
    workspaceId: workspaceId(),
    typeId: text("type_id")
      .notNull()
      .references(() => relationshipTypes.id, { onDelete: "restrict" }),
    sourceId: text("source_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    targetId: text("target_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    direction: text("direction").notNull().default("forward"),
    label: text("label").notNull().default(""),
    description: text("description").notNull().default(""),
    status: text("status"),
    weight: doublePrecision("weight"),
    date: date("date", { mode: "string" }),
    properties: jsonb("properties").notNull().default({}),
    /** Presentation override only. Never read by analyses. */
    visual: jsonb("visual"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("relationships_ws_idx").on(t.workspaceId),
    index("relationships_source_idx").on(t.sourceId),
    index("relationships_target_idx").on(t.targetId),
    index("relationships_type_idx").on(t.typeId),
  ],
);

// ---------------------------------------------------------------------------
// Presentation data
// ---------------------------------------------------------------------------

export const canvases = pgTable(
  "canvases",
  {
    id: text("id").primaryKey(),
    workspaceId: workspaceId(),
    name: text("name").notNull(),
    viewport: jsonb("viewport").notNull(),
    sortOrder: doublePrecision("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("canvases_ws_idx").on(t.workspaceId)],
);

export const placements = pgTable(
  "canvas_placements",
  {
    id: text("id").primaryKey(),
    workspaceId: workspaceId(),
    canvasId: text("canvas_id")
      .notNull()
      .references(() => canvases.id, { onDelete: "cascade" }),
    entityId: text("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    x: doublePrecision("x").notNull(),
    y: doublePrecision("y").notNull(),
    width: doublePrecision("width"),
    height: doublePrecision("height"),
    style: jsonb("style").notNull().default({}),
    collapsed: boolean("collapsed").notNull().default(false),
    z: doublePrecision("z").notNull().default(0),
  },
  (t) => [
    uniqueIndex("placements_canvas_entity_uq").on(t.canvasId, t.entityId),
    index("placements_entity_idx").on(t.entityId),
  ],
);

export const annotations = pgTable(
  "canvas_annotations",
  {
    id: text("id").primaryKey(),
    workspaceId: workspaceId(),
    canvasId: text("canvas_id")
      .notNull()
      .references(() => canvases.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    x: doublePrecision("x").notNull(),
    y: doublePrecision("y").notNull(),
    width: doublePrecision("width").notNull(),
    height: doublePrecision("height").notNull(),
    text: text("text").notNull().default(""),
    style: jsonb("style").notNull().default({}),
    z: doublePrecision("z").notNull().default(0),
  },
  (t) => [index("annotations_canvas_idx").on(t.canvasId)],
);

// ---------------------------------------------------------------------------
// View configuration (Phase 3+)
// ---------------------------------------------------------------------------

export const savedViews = pgTable("saved_views", {
  id: text("id").primaryKey(),
  workspaceId: workspaceId(),
  name: text("name").notNull(),
  viewType: text("view_type").notNull(),
  /** Filters, sort, grouping, visible columns. */
  config: jsonb("config").notNull().default({}),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const dashboards = pgTable("dashboards", {
  id: text("id").primaryKey(),
  workspaceId: workspaceId(),
  name: text("name").notNull(),
  layout: jsonb("layout").notNull().default({}),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const dashboardWidgets = pgTable("dashboard_widgets", {
  id: text("id").primaryKey(),
  dashboardId: text("dashboard_id")
    .notNull()
    .references(() => dashboards.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  /** Data source, entity/relationship types, filters, grouping, display, sort, fields. */
  query: jsonb("query").notNull().default({}),
  display: jsonb("display").notNull().default({}),
  position: jsonb("position").notNull().default({}),
});

// ---------------------------------------------------------------------------
// Infrastructure
// ---------------------------------------------------------------------------

export const attachments = pgTable(
  "attachments",
  {
    id: text("id").primaryKey(),
    workspaceId: workspaceId(),
    entityId: text("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    url: text("url").notNull(),
    mimeType: text("mime_type"),
    size: integer("size"),
    createdAt: createdAt(),
  },
  (t) => [index("attachments_entity_idx").on(t.entityId)],
);

/** Applied op batches: makes client retries idempotent. */
export const opBatches = pgTable("op_batches", {
  id: text("id").primaryKey(),
  workspaceId: workspaceId(),
  appliedAt: ts("applied_at").notNull().defaultNow(),
  opCount: integer("op_count").notNull(),
});

/** Append-only audit log: one row per applied op. */
export const changeEvents = pgTable(
  "change_events",
  {
    id: text("id").primaryKey(),
    workspaceId: workspaceId(),
    batchId: text("batch_id").notNull(),
    seq: integer("seq").notNull(),
    at: ts("at").notNull().defaultNow(),
    op: text("op").notNull(),
    kind: text("kind").notNull(),
    targetId: text("target_id").notNull(),
    payload: jsonb("payload").notNull(),
  },
  (t) => [
    index("change_events_target_idx").on(t.workspaceId, t.targetId, t.at),
    index("change_events_batch_idx").on(t.batchId),
  ],
);

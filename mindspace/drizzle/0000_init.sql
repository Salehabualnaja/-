CREATE TABLE "canvas_annotations" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"canvas_id" text NOT NULL,
	"kind" text NOT NULL,
	"x" double precision NOT NULL,
	"y" double precision NOT NULL,
	"width" double precision NOT NULL,
	"height" double precision NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"style" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"z" double precision DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"mime_type" text,
	"size" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "canvases" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"viewport" jsonb NOT NULL,
	"sort_order" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "change_events" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"batch_id" text NOT NULL,
	"seq" integer NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"op" text NOT NULL,
	"kind" text NOT NULL,
	"target_id" text NOT NULL,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dashboard_widgets" (
	"id" text PRIMARY KEY NOT NULL,
	"dashboard_id" text NOT NULL,
	"title" text NOT NULL,
	"query" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"display" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"position" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dashboards" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"layout" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entities" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"type_id" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"status" text,
	"priority" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"start_date" date,
	"due_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_types" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"name_en" text DEFAULT '' NOT NULL,
	"icon" text DEFAULT '' NOT NULL,
	"color" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"sort_order" double precision DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "field_definitions" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"entity_type_id" text,
	"relationship_type_id" text,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"data_type" text NOT NULL,
	"options" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sort_order" double precision DEFAULT 0 NOT NULL,
	CONSTRAINT "field_definitions_one_owner" CHECK (("field_definitions"."entity_type_id" is null) <> ("field_definitions"."relationship_type_id" is null))
);
--> statement-breakpoint
CREATE TABLE "op_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"op_count" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "canvas_placements" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"canvas_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"x" double precision NOT NULL,
	"y" double precision NOT NULL,
	"width" double precision,
	"height" double precision,
	"style" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"collapsed" boolean DEFAULT false NOT NULL,
	"z" double precision DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "relationship_types" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"key" text NOT NULL,
	"category" text NOT NULL,
	"name" text NOT NULL,
	"name_en" text DEFAULT '' NOT NULL,
	"inverse_name" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"directed" boolean DEFAULT true NOT NULL,
	"visual" jsonb NOT NULL,
	"sort_order" double precision DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "relationships" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"type_id" text NOT NULL,
	"source_id" text NOT NULL,
	"target_id" text NOT NULL,
	"direction" text DEFAULT 'forward' NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" text,
	"weight" double precision,
	"date" date,
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"visual" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_views" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"view_type" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "canvas_annotations" ADD CONSTRAINT "canvas_annotations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canvas_annotations" ADD CONSTRAINT "canvas_annotations_canvas_id_canvases_id_fk" FOREIGN KEY ("canvas_id") REFERENCES "public"."canvases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canvases" ADD CONSTRAINT "canvases_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_events" ADD CONSTRAINT "change_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_widgets" ADD CONSTRAINT "dashboard_widgets_dashboard_id_dashboards_id_fk" FOREIGN KEY ("dashboard_id") REFERENCES "public"."dashboards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboards" ADD CONSTRAINT "dashboards_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_type_id_entity_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."entity_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_types" ADD CONSTRAINT "entity_types_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_definitions" ADD CONSTRAINT "field_definitions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_definitions" ADD CONSTRAINT "field_definitions_entity_type_id_entity_types_id_fk" FOREIGN KEY ("entity_type_id") REFERENCES "public"."entity_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_definitions" ADD CONSTRAINT "field_definitions_relationship_type_id_relationship_types_id_fk" FOREIGN KEY ("relationship_type_id") REFERENCES "public"."relationship_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "op_batches" ADD CONSTRAINT "op_batches_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canvas_placements" ADD CONSTRAINT "canvas_placements_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canvas_placements" ADD CONSTRAINT "canvas_placements_canvas_id_canvases_id_fk" FOREIGN KEY ("canvas_id") REFERENCES "public"."canvases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canvas_placements" ADD CONSTRAINT "canvas_placements_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_types" ADD CONSTRAINT "relationship_types_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_type_id_relationship_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."relationship_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_source_id_entities_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_target_id_entities_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "annotations_canvas_idx" ON "canvas_annotations" USING btree ("canvas_id");--> statement-breakpoint
CREATE INDEX "attachments_entity_idx" ON "attachments" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "canvases_ws_idx" ON "canvases" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "change_events_target_idx" ON "change_events" USING btree ("workspace_id","target_id","at");--> statement-breakpoint
CREATE INDEX "change_events_batch_idx" ON "change_events" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "entities_ws_type_idx" ON "entities" USING btree ("workspace_id","type_id");--> statement-breakpoint
CREATE INDEX "entities_ws_updated_idx" ON "entities" USING btree ("workspace_id","updated_at");--> statement-breakpoint
CREATE INDEX "entity_types_ws_idx" ON "entity_types" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "field_definitions_ws_idx" ON "field_definitions" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "placements_canvas_entity_uq" ON "canvas_placements" USING btree ("canvas_id","entity_id");--> statement-breakpoint
CREATE INDEX "placements_entity_idx" ON "canvas_placements" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "relationship_types_ws_idx" ON "relationship_types" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "relationships_ws_idx" ON "relationships" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "relationships_source_idx" ON "relationships" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "relationships_target_idx" ON "relationships" USING btree ("target_id");--> statement-breakpoint
CREATE INDEX "relationships_type_idx" ON "relationships" USING btree ("type_id");
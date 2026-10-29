"use client";
import { useMemo, useState } from "react";
import { useWorkspace } from "../store";
import { createTypeWithEntityAt } from "../actions";
import { ENTITY_ICONS, EntityIcon, PALETTE } from "../icons";
import { Button, Dialog, Input, Label, Swatches, cn } from "../ui";

/** "أخرى": name a new kind of entity, choose its look, and create the first one. */
export function NewTypeDialog() {
  const at = useWorkspace((s) => s.newTypeAt);
  const typeCount = useWorkspace((s) => Object.keys(s.snap.entityTypes).length);
  const set = useWorkspace((s) => s.set);
  if (!at) return null;
  return <NewTypeForm key={`${at.x},${at.y}`} at={at} defaultColor={PALETTE[typeCount % PALETTE.length]} onClose={() => set({ newTypeAt: null })} />;
}

function NewTypeForm({ at, defaultColor, onClose }: { at: { x: number; y: number }; defaultColor: string; onClose: () => void }) {
  const types = useWorkspace((s) => s.snap.entityTypes);
  const names = useMemo(() => Object.values(types).map((t) => t.name.trim()), [types]);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("circle");
  const [color, setColor] = useState(defaultColor);
  const trimmed = name.trim();
  const duplicate = names.includes(trimmed);
  const submit = () => {
    if (trimmed && !duplicate) createTypeWithEntityAt({ name: trimmed, icon, color }, at);
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="صنف جديد" description="سمِّ الصنف واختر شكله، ثم اكتب عنوان أول كيان منه على اللوحة.">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div>
          <Label hint={duplicate ? <span className="text-red-600">هذا الاسم موجود؛ اختره من القائمة</span> : undefined}>اسم الصنف</Label>
          <Input id="new-type-name" autoFocus placeholder="مثل: كتاب، عميل، فرصة، اجتماع" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label>الأيقونة</Label>
          <div className="flex max-h-32 flex-wrap gap-1 overflow-auto">
            {Object.keys(ENTITY_ICONS).map((n) => (
              <button
                key={n}
                type="button"
                title={n}
                onClick={() => setIcon(n)}
                className={cn("flex h-8 w-8 items-center justify-center rounded-md border", icon === n ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-transparent hover:bg-[var(--surface-2)]")}
              >
                <EntityIcon name={n} size={16} color={color} />
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label>اللون</Label>
          <Swatches colors={PALETTE} value={color} onChange={(c) => c && setColor(c)} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm" style={{ background: `${color}22`, color }}>
            <EntityIcon name={icon} size={14} color={color} /> {trimmed || "اسم الصنف"}
          </span>
          <Button type="submit" variant="primary" disabled={!trimmed || duplicate}>
            إنشاء
          </Button>
        </div>
        <p className="text-xs text-[var(--fg-subtle)]">يُحفظ الصنف ويظهر في القوائم من الآن. وتضيف له حقولاً خاصة من «الإعدادات».</p>
      </form>
    </Dialog>
  );
}

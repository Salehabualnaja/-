import { emptySnapshot, type Snapshot } from "@/core/model";
import { applyOps } from "@/core/ops";
import { DEFAULT_SETTINGS, presetOps } from "@/core/presets";

export function presetSnapshot(): Snapshot {
  const s = emptySnapshot({ id: "ws", name: "test", settings: DEFAULT_SETTINGS });
  return applyOps(s, presetOps());
}

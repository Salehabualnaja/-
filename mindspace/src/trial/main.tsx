/** Entry of the browser-only trial build (published as a claude.ai Artifact). */
import { createRoot } from "react-dom/client";
import { App } from "@/client/App";
import { setStandaloneBackend, useWorkspace } from "@/client/store";
import { setFileSaver } from "@/client/exporters";
import { createTrialBackend } from "./backend";

type ClaudeRuntime = { use(name: string): Promise<unknown> };
type Downloads = { save(r: { filename: string; data: string }): Promise<void> };

// Follow the viewer's theme (explicit data-theme, else the OS setting).
function syncTheme() {
  const root = document.documentElement;
  const explicit = root.getAttribute("data-theme");
  let dark = explicit ? explicit === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  try {
    const saved = localStorage.getItem("mindspace:theme");
    if (saved && !explicit) dark = saved === "dark";
  } catch {
    /* ignore */
  }
  root.classList.toggle("dark", dark);
}
syncTheme();
new MutationObserver(syncTheme).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", syncTheme);
document.documentElement.lang = "ar";
document.documentElement.dir = "rtl";

async function boot() {
  const st = () => useWorkspace.getState();
  const claude = (globalThis as { claude?: ClaudeRuntime }).claude;
  const { backend, mode } = await createTrialBackend(
    (syncState, pending) => st().set({ syncState, pending }),
    (msg) => st().toast(msg, "error"),
  );
  setStandaloneBackend(backend);

  const downloads = ((await claude?.use("downloads").catch(() => null)) ?? null) as Downloads | null;
  setFileSaver((filename, _mime, data) => {
    if (!downloads) {
      st().toast("التصدير غير متاح في هذا العرض.", "error");
      return;
    }
    downloads.save({ filename, data }).catch((e: { code?: string }) => {
      if (e?.code !== "declined") st().toast("تعذّر حفظ الملف.", "error");
    });
  });

  createRoot(document.getElementById("root")!).render(<App />);
  if (mode === "browser")
    setTimeout(() => st().toast("نسخة تجربة: تُحفظ بياناتك في هذا المتصفح فقط.", "info"), 1500);
}

void boot();

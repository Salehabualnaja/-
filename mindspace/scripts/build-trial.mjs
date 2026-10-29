// Builds the browser-only trial into one self-contained HTML file:
//   node scripts/build-trial.mjs  ->  dist-trial/index.html
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import fs from "node:fs";

fs.mkdirSync("dist-trial", { recursive: true });

// Tailwind: same stylesheet as the app, scanning the client sources.
fs.writeFileSync(
  "dist-trial/input.css",
  fs.readFileSync("src/app/globals.css", "utf8").replace('@import "tailwindcss";', '@import "tailwindcss" source("../src");'),
);
execFileSync("node_modules/.bin/tailwindcss", ["-i", "dist-trial/input.css", "-o", "dist-trial/app.css", "--minify"], { stdio: "inherit" });

const js = await build({
  entryPoints: ["src/trial/main.tsx"],
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2020",
  jsx: "automatic",
  write: false,
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "warning",
});

const css = fs.readFileSync("dist-trial/app.css", "utf8");
const code = js.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const html = `<title>MINDSPACE</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700&display=swap">
<style>:root{--font-tajawal:"Tajawal"}html,body,#root{height:100%}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){color-scheme:dark}}
:root[data-theme="dark"]{color-scheme:dark}
${css}</style>
<div id="root"></div>
<script>${code}</script>
`;
fs.writeFileSync("dist-trial/index.html", html);
console.log(`dist-trial/index.html: ${(html.length / 1024).toFixed(0)} KiB`);

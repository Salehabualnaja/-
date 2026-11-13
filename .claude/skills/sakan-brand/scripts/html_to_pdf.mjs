// يحوّل index.html في مجلد العمل إلى PDF بمقاس A4، مع رقم الصفحة في التذييل.
// الاستعمال: node html_to_pdf.mjs OUT_DIR OUT.pdf
import { createRequire } from "module";
import { execSync } from "child_process";
import path from "path";

const require = createRequire(import.meta.url);
const globalRoot = execSync("npm root -g").toString().trim();
const { chromium } = require(path.join(globalRoot, "playwright"));

const [dir, out] = process.argv.slice(2);
const browser = await chromium.launch(
  process.env.PLAYWRIGHT_BROWSERS_PATH ? {} : { executablePath: "/opt/pw-browsers/chromium" }
);
const page = await browser.newPage();
await page.goto("file://" + path.resolve(dir, "index.html"), { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.pdf({
  path: out,
  format: "A4",
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: "<span></span>",
  footerTemplate:
    '<div style="width:100%;font-size:8px;color:#7e8c5a;text-align:center;font-family:sans-serif">' +
    '<span class="pageNumber"></span></div>',
  margin: { top: "0", bottom: "0" },
});
await browser.close();
console.log(out);

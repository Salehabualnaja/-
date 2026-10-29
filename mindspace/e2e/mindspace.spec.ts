import { expect, test } from "@playwright/test";
import { card, connect, createCard, openApp, waitSaved } from "./helpers";

test.describe.configure({ mode: "serial" });

test("starts empty, creates cards by double-click, and keeps them after reload", async ({ page }) => {
  await openApp(page);
  await expect(page.locator(".react-flow__node")).toHaveCount(0);
  await expect(page.getByText("لوحة فارغة للتفكير")).toBeVisible();

  await createCard(page, "فكرة أ", -250, 0);
  await createCard(page, "فكرة ب", 250, 120);
  await waitSaved(page);

  await page.reload();
  await expect(card(page, "فكرة أ")).toBeVisible();
  await expect(card(page, "فكرة ب")).toBeVisible();
});

test("creates a typed relationship by dragging between cards, and it persists", async ({ page }) => {
  await openApp(page);
  await connect(page, "فكرة أ", "فكرة ب");
  const picker = page.getByRole("dialog", { name: "نوع العلاقة" });
  await expect(picker).toBeVisible();
  await picker.getByRole("button", { name: "يعتمد على" }).click();
  await picker.getByPlaceholder(/اسم العلاقة/).fill("يحتاج نتائج");
  await picker.getByRole("button", { name: "حفظ العلاقة" }).click();
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
  await expect(page.getByText("يحتاج نتائج")).toBeVisible();
  await waitSaved(page);

  await page.reload();
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
  await page.getByText("يحتاج نتائج").click();
  const inspector = page.getByTestId("inspector");
  await expect(inspector.getByRole("combobox").first()).toHaveValue(/.+/);
  await expect(inspector.getByText("علاقة · الاعتماديات")).toBeVisible();
});

test("moving a card is undoable and does not touch its relationships", async ({ page }) => {
  await openApp(page);
  const a = card(page, "فكرة أ");
  const before = (await a.boundingBox())!;
  await a.hover();
  await page.mouse.move(before.x + 60, before.y + 30);
  await page.mouse.down();
  await page.mouse.move(before.x + 60, before.y + 230, { steps: 8 });
  await page.mouse.up();
  const moved = (await a.boundingBox())!;
  expect(Math.round(moved.y - before.y)).toBeGreaterThan(150);
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);

  await page.keyboard.press("Control+z");
  await expect.poll(async () => Math.round((await a.boundingBox())!.y)).toBe(Math.round(before.y));
  await page.keyboard.press("Control+Shift+z");
  await expect.poll(async () => Math.round((await a.boundingBox())!.y)).toBe(Math.round(moved.y));
  await waitSaved(page);
});

test("Delete removes a card from the canvas only; the entity stays in the inbox", async ({ page }) => {
  await openApp(page);
  await card(page, "فكرة ب").click();
  await page.keyboard.press("Delete");
  await expect(card(page, "فكرة ب")).toHaveCount(0);
  await expect(page.locator(".react-flow__edge")).toHaveCount(0);
  const inbox = page.getByRole("navigation", { name: "التنقل" });
  await expect(inbox.getByText("فكرة ب")).toBeVisible();
  await waitSaved(page);

  // Dragging it back from the inbox restores the card, and its relationship reappears.
  const pane = (await page.locator(".react-flow__pane").boundingBox())!;
  await inbox.getByText("فكرة ب").dragTo(page.locator(".react-flow__pane"), {
    targetPosition: { x: pane.width / 2 + 200, y: pane.height / 2 + 200 },
  });
  await expect(card(page, "فكرة ب")).toBeVisible();
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
  await waitSaved(page);
});

test("an edit in the table appears on the canvas", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "الجدول", exact: true }).click();
  // The value attribute changes while typing, so hold on to the element itself.
  const title = (await page.getByTestId("entity-table").locator('input[value="فكرة أ"]').elementHandle())!;
  await title.fill("فكرة أ معدّلة");
  await title.press("Enter");
  await page.getByRole("button", { name: "اللوحة", exact: true }).click();
  await expect(card(page, "فكرة أ معدّلة")).toBeVisible();
  await waitSaved(page);
});

test("the demo scenario produces the expected dashboards", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "المزيد" }).click();
  await page.getByText("تحميل السيناريو التجريبي").click();
  await expect(card(page, "تأسيس صندوق استثماري")).toBeVisible();
  await expect(page.locator(".react-flow__edge")).toHaveCount(10);
  await waitSaved(page);

  await page.getByRole("button", { name: "لوحات المعلومات" }).click();
  const people = page.getByTestId("people-dashboard");
  const ahmad = people.getByTestId("person-row").filter({ hasText: "أحمد" });
  await expect(ahmad).toHaveCount(1);
  await expect(ahmad).toContainText("في 2 مشاريع");
  await expect(ahmad).toContainText("مستشار");
  await expect(ahmad).toContainText("إنشاء شركة استشارية");
  await expect(ahmad).toContainText("تأسيس صندوق استثماري");

  await page.getByRole("button", { name: "الموارد", exact: true }).click();
  const legal = page.getByTestId("resource-row").filter({ hasText: "مستشار قانوني" });
  await expect(legal).toContainText("تأسيس صندوق استثماري");
  await expect(legal).toContainText("إنشاء شركة استشارية");
  await expect(legal).toContainText("مورد مشترك");

  await page.getByRole("button", { name: "المالية", exact: true }).click();
  const budget = page.getByTestId("financial-row").filter({ hasText: "ميزانية التأسيس" });
  await expect(budget).toContainText("تأسيس صندوق استثماري");
  await expect(budget).toContainText("250,000");

  // Data survives a reload, and the dashboards are recomputed from it.
  await page.reload();
  await page.getByRole("button", { name: "لوحات المعلومات" }).click();
  await expect(page.getByTestId("person-row").filter({ hasText: "أحمد" })).toHaveCount(1);
});

test("search moves the camera to an entity", async ({ page }) => {
  await openApp(page);
  await page.keyboard.press("Control+k");
  await page.getByPlaceholder("ابحث عن كيان أو أمر…").fill("خالد");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("inspector").getByLabel("العنوان")).toHaveValue("خالد");
  await expect(card(page, "خالد")).toBeInViewport();
});

test("'Other' in the entity menu defines a new type and creates its first card", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "كيان", exact: true }).click();
  await page.getByText("أخرى… (صنف تحدّده أنت)").click();
  await page.getByPlaceholder(/مثل: كتاب/).fill("كتاب");
  await page.getByRole("button", { name: "إنشاء" }).click();
  const editor = page.locator(".react-flow__node textarea");
  await expect(editor).toBeFocused();
  await page.keyboard.type("فن الحرب");
  await page.keyboard.press("Enter");
  await expect(card(page, "فن الحرب")).toContainText("كتاب");
  await waitSaved(page);

  // The new type is now a regular choice everywhere.
  await page.reload();
  await page.getByRole("button", { name: "كيان", exact: true }).click();
  await expect(page.getByRole("button", { name: "كتاب", exact: true })).toBeVisible();
});

import { expect, type Page } from "@playwright/test";

export async function openApp(page: Page) {
  await page.goto("/");
  await expect(page.locator(".react-flow__pane")).toBeVisible();
}

/** Wait until every edit has been confirmed by the server. */
export async function waitSaved(page: Page) {
  await expect(page.getByTestId("sync-state")).toHaveAttribute("data-state", "saved", { timeout: 10_000 });
}

export function card(page: Page, title: string) {
  return page.locator(".react-flow__node", { hasText: title });
}

/** Double-click the empty canvas at an offset from its centre and type a title. */
export async function createCard(page: Page, title: string, dx = 0, dy = 0) {
  const box = (await page.locator(".react-flow__pane").boundingBox())!;
  await page.mouse.dblclick(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
  const editor = page.locator(".react-flow__node textarea");
  await expect(editor).toBeFocused();
  await page.keyboard.type(title);
  await page.keyboard.press("Enter");
  await expect(card(page, title)).toBeVisible();
}

/** Drag a line from the edge of one card onto the body of another. */
export async function connect(page: Page, fromTitle: string, toTitle: string) {
  const from = card(page, fromTitle);
  await from.hover();
  const handle = from.locator(".react-flow__handle-bottom");
  const h = (await handle.boundingBox())!;
  const t = (await card(page, toTitle).boundingBox())!;
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + 40, h.y + 40, { steps: 5 });
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 10 });
  await page.mouse.up();
}

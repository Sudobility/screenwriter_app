import { expect, test, type Page } from "@playwright/test";
import { devUidForEmail } from "../../screenwriter_lib/src/auth/dev-auth";

// Agent "act": the AI proposes typed operations (comment, rename-character); the writer applies each one explicitly
// and every apply is an undoable command. Real stack, fixture AI.

const email = `e2e-agent-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
const API = `http://localhost:${Number(process.env.E2E_API_PORT ?? 18042)}`;
const authFor = (e: string) => ({ Authorization: `Bearer dev:${devUidForEmail(e)}:${e}` });
const synced = (page: Page) => expect(page.getByTestId("sync-status")).toHaveAttribute("data-state", "synced");

test("agent-act proposes operations the writer applies one by one", async ({ page }) => {
  await page.goto("/en/login");
  await page.getByLabel("Dev login (email, no password)").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("x");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("New project name").fill("Agent project");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible();
  await page.getByLabel("Title", { exact: true }).fill("A script");
  await page.getByRole("button", { name: "Create document" }).click();
  await expect(page).toHaveURL(/\/d\/(doc_[A-Za-z0-9]+)/);
  await expect(page.getByTestId("script-editor")).toBeVisible();
  await synced(page);
  await page.evaluate(() => {
    const s = (window as any).__fadewright.session;
    const starter = s.model.elements()[0].id as string;
    s.execute([{ id: "element.setStyle", params: { elements: [starter], style: "st_dialogue" } }], { kind: "local-command" });
    s.execute([{ id: "element.insert", params: { before: starter, style: "st_scene_heading", text: "int. archive - night" } }], { kind: "local-command" });
    s.execute([{ id: "element.insert", params: { before: starter, style: "st_character", text: "quinn" } }], { kind: "local-command" });
    s.execute([{ id: "element.insert", params: { before: starter, style: "st_dialogue", text: "It's all still here." } }], { kind: "local-command" });
  });
  await synced(page);
  await page.request.post(`${API}/api/v1/me/ai-consents`, { headers: authFor(email), data: { version: 1 } });

  await page.getByTestId("ai-button").click();
  const section = page.getByTestId("ai-agent-section");
  await expect(section).toBeVisible();
  await section.getByTestId("ai-agent-input").fill("Flag the opening's pacing and rename Quinn.");
  await section.getByTestId("ai-agent-propose").click();

  await expect(section.getByTestId("ai-agent-result")).toBeVisible({ timeout: 30_000 });
  await expect(section.getByTestId("ai-agent-op")).toHaveCount(2);

  // Apply the rename: the cue is rewritten in the script (undoable).
  const renameOp = section.locator('[data-testid="ai-agent-op"][data-kind="rename-character"]');
  await renameOp.getByTestId("ai-agent-op-apply").click();
  await expect(renameOp.getByTestId("ai-agent-op-done")).toContainText("Renamed");
  await expect(page.getByTestId("script-editor")).toContainText("QUINNX");

  // Apply the comment: it enters the triage system as a pending comment.
  const commentOp = section.locator('[data-testid="ai-agent-op"][data-kind="comment"]');
  await commentOp.getByTestId("ai-agent-op-apply").click();
  await expect(commentOp.getByTestId("ai-agent-op-done")).toContainText("Comment added");
});

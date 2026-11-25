import { expect, test, type Page } from "@playwright/test";
import { devUidForEmail } from "../../screenwriter_lib/src/auth/dev-auth";

// Structured comments: the writer adds a comment (type + comment + suggestion), triages it through the
// lifecycle (pending → todo → completed / rejected), fixes one with AI, and a focused AI review files its
// findings as pending comments. An org member can comment but cannot triage. Real stack, AI fixture mode.

const email = `e2e-comments-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
const API = `http://localhost:${Number(process.env.E2E_API_PORT ?? 18042)}`;
const authFor = (e: string) => ({ Authorization: `Bearer dev:${devUidForEmail(e)}:${e}` });
const synced = (page: Page) => expect(page.getByTestId("sync-status")).toHaveAttribute("data-state", "synced");

const H = ["INT. KITCHEN - DAY", "EXT. ROOFTOP - DAWN", "INT. DINER - NIGHT"];
const seed = () => {
  const cmds: { id: string; params: Record<string, unknown> }[] = [];
  H.forEach((h, i) => {
    cmds.push({ id: "element.insert", params: { style: "st_scene_heading", text: h } });
    cmds.push({ id: "element.insert", params: { style: "st_action", text: `Something happens in scene ${i + 1}.` } });
    cmds.push({ id: "element.insert", params: { style: "st_character", text: "MAYA" } });
    cmds.push({ id: "element.insert", params: { style: "st_dialogue", text: "I can't do this." } });
  });
  return cmds;
};

async function openDoc(page: Page) {
  await page.goto("/en/login");
  await page.getByLabel("Dev login (email, no password)").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("x");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("New project name").fill("Comments project");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible();
  await page.getByLabel("Title", { exact: true }).fill("Three scenes");
  await page.getByRole("button", { name: "Create document" }).click();
  await expect(page).toHaveURL(/\/d\/(doc_[A-Za-z0-9]+)/);
  await expect(page.getByTestId("script-editor")).toBeVisible();
  await synced(page);
  await page.evaluate(c => {
    const s = (window as any).__fadewright.session;
    for (const el of [...s.model.elements()]) s.execute([{ id: "text.deleteBackward", params: { at: { elementId: el.id, offset: 0 }, unit: "element" } }]);
    for (const cmd of c) s.execute([cmd], { kind: "local-command" });
  }, seed());
  await synced(page);
}

test("writer adds a structured comment and triages it pending → todo → completed → reopened", async ({ page }) => {
  await openDoc(page);
  const panel = page.getByTestId("comments-panel");

  await page.getByTestId("comments-button").click();
  await expect(panel).toBeVisible();

  // Place the caret in a scene so "Add a comment" has a target.
  await page.getByTestId("script-editor").getByText("INT. KITCHEN - DAY").click();

  await panel.getByTestId("comment-category").click();
  await page.getByRole("option", { name: "motive", exact: true }).click();
  await panel.getByTestId("comment-draft").fill("Why does Maya give up here?");
  await panel.getByTestId("comment-suggestion").fill("Plant her exhaustion in the prior scene.");
  await panel.getByTestId("comment-add").click();

  const comment = panel.getByTestId("comment").first();
  await expect(comment).toBeVisible();
  await expect(comment).toHaveAttribute("data-source", "writer");
  await expect(comment).toHaveAttribute("data-status", "pending");
  await expect(comment).toContainText("Why does Maya give up here?");
  await expect(comment).toContainText("Plant her exhaustion");

  // Confirm → TODO.
  await comment.getByTestId("comment-confirm").click();
  await expect(panel.getByTestId("comment").first()).toHaveAttribute("data-status", "todo");

  // Complete → leaves the active list (hidden by default).
  await panel.getByTestId("comment").first().getByTestId("comment-complete").click();
  await expect(panel.getByTestId("comment")).toHaveCount(0);

  // History shows it as completed; reopen brings it back to pending.
  await panel.getByText("Show completed & rejected").click();
  const done = panel.getByTestId("comment").first();
  await expect(done).toHaveAttribute("data-status", "completed");
  await done.getByTestId("comment-reopen").click();
  await expect(panel.getByTestId("comment").first()).toHaveAttribute("data-status", "pending");
});

test("a focused AI review files its findings as pending comments", async ({ page }) => {
  await openDoc(page);

  // Run a focused (character) review from the AI panel; the fixture returns comments.
  await page.getByTestId("ai-button").click();
  await page.getByTestId("ai-action-focused-review").click();
  await expect(page.getByTestId("ai-focused-review-section")).toBeVisible();
  await page.getByTestId("ai-review-kind").click();
  await page.getByTestId("ai-review-kind-character").click();
  await page.getByTestId("ai-focused-review-button").click();
  // First AI use asks for consent; accept, then the review runs on a second click.
  const consent = page.getByTestId("ai-panel-consent");
  await expect(consent).toBeVisible();
  await expect(page.getByTestId("ai-error")).toHaveCount(0);
  await page.getByTestId("ai-panel-consent-accept").click();
  await expect(consent).toHaveCount(0);
  await page.getByTestId("ai-focused-review-button").click();
  await expect(page.getByTestId("ai-focused-review-result")).toContainText("Added", { timeout: 30_000 });
  await synced(page);

  // Those findings appear in the Comments panel as AI-sourced pending comments.
  await page.getByTestId("comments-button").click();
  const panel = page.getByTestId("comments-panel");
  await expect(panel).toBeVisible();
  const aiComment = panel.locator('[data-testid="comment"][data-source="ai"]').first();
  await expect(aiComment).toBeVisible();
  await expect(aiComment).toHaveAttribute("data-status", "pending");

  // The writer can reject an AI comment, and it leaves the active list.
  const before = await panel.locator('[data-testid="comment"][data-source="ai"]').count();
  await aiComment.getByTestId("comment-reject").click();
  await expect(panel.locator('[data-testid="comment"][data-source="ai"]')).toHaveCount(before - 1);
});

test("the writer fixes a comment with AI, which applies an edit and completes the comment", async ({ page }) => {
  await openDoc(page);
  // Consent is covered elsewhere; this test is about the per-comment AI fix.
  await page.request.post(`${API}/api/v1/me/ai-consents`, { headers: authFor(email), data: { version: 1 } });

  await page.getByTestId("comments-button").click();
  const panel = page.getByTestId("comments-panel");
  await expect(panel).toBeVisible();
  await page.getByTestId("script-editor").getByText("INT. KITCHEN - DAY").click();
  await panel.getByTestId("comment-category").click();
  await page.getByRole("option", { name: "dialogue", exact: true }).click();
  await panel.getByTestId("comment-draft").fill("Maya's line is on the nose.");
  await panel.getByTestId("comment-add").click();

  const comment = panel.getByTestId("comment").first();
  await expect(comment).toHaveAttribute("data-status", "pending");

  // Fix with AI → ask for fixes → accept one. The edit applies and the comment becomes completed.
  await comment.getByTestId("comment-ai").click();
  await comment.getByTestId("note-suggest-fixes").click();
  const accept = comment.getByTestId("note-fix-accept").first();
  await expect(accept).toBeVisible({ timeout: 30_000 });
  await accept.click();

  // Completed comments leave the active list; the history view shows it as completed.
  await expect(panel.getByTestId("comment")).toHaveCount(0);
  await panel.getByText("Show completed & rejected").click();
  await expect(panel.getByTestId("comment").first()).toHaveAttribute("data-status", "completed");
  await synced(page);
});

test("the writer fixes all TODOs at once with AI", async ({ page }) => {
  await openDoc(page);
  await page.request.post(`${API}/api/v1/me/ai-consents`, { headers: authFor(email), data: { version: 1 } });

  await page.getByTestId("comments-button").click();
  const panel = page.getByTestId("comments-panel");
  await expect(panel).toBeVisible();

  // Two comments on two scenes, each confirmed to TODO.
  for (const heading of ["INT. KITCHEN - DAY", "EXT. ROOFTOP - DAWN"]) {
    await page.getByTestId("script-editor").getByText(heading).click();
    await panel.getByTestId("comment-category").click();
    await page.getByRole("option", { name: "dialogue", exact: true }).click();
    await panel.getByTestId("comment-draft").fill(`Tighten the dialogue in ${heading}.`);
    await panel.getByTestId("comment-add").click();
  }
  // Confirm each pending comment (clicking re-renders the list, so re-query the first each time).
  while ((await panel.getByTestId("comment-confirm").count()) > 0) {
    await panel.getByTestId("comment-confirm").first().click();
  }
  await expect(panel.locator('[data-testid="comment"][data-status="todo"]')).toHaveCount(2);

  // One click fixes every TODO with AI; they all complete and leave the active list.
  await panel.getByTestId("comment-fix-all-todos").click();
  await expect(panel.getByTestId("comment-fix-all-result")).toContainText("Fixed", { timeout: 60_000 });
  await expect(panel.getByTestId("comment")).toHaveCount(0);
  await panel.getByText("Show completed & rejected").click();
  await expect(panel.locator('[data-testid="comment"][data-status="completed"]')).toHaveCount(2);
  await synced(page);
});

test("an org member can comment on the live script but cannot triage", async ({ page, browser }) => {
  const memberEmail = `e2e-member-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

  // Owner creates the document, then invites the member at document level.
  await openDoc(page);
  const did = /\/d\/(doc_[A-Za-z0-9]+)/.exec(page.url())![1]!;
  const docUrl = page.url();
  const inv = await page.request.post(`${API}/api/v1/documents/${did}/invitations`, { headers: authFor(email), data: { email: memberEmail, role: "member" } });
  expect(inv.ok(), `invite failed: ${inv.status()}`).toBe(true);
  const iid = (await inv.json()).data.id as string;

  // The member signs in (which creates their account), accepts the invitation, then opens the shared doc.
  const ctx = await browser.newContext();
  const mp = await ctx.newPage();
  await mp.goto("/en/login");
  await mp.getByLabel("Dev login (email, no password)").fill(memberEmail);
  await mp.getByLabel("Password", { exact: true }).fill("x");
  await mp.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(mp).not.toHaveURL(/\/login/);
  const acc = await mp.request.post(`${API}/api/v1/invitations/${iid}/accept`, { headers: authFor(memberEmail) });
  expect(acc.ok(), `accept failed: ${acc.status()}`).toBe(true);

  await mp.goto(docUrl);
  await expect(mp.getByTestId("script-editor")).toBeVisible();
  await synced(mp);

  await mp.getByTestId("comments-button").click();
  const panel = mp.getByTestId("comments-panel");
  await expect(panel).toBeVisible();
  await mp.getByTestId("script-editor").getByText("INT. KITCHEN - DAY").click();
  await panel.getByTestId("comment-draft").fill("A note from a collaborator.");
  await panel.getByTestId("comment-add").click();

  const c = panel.getByTestId("comment").first();
  await expect(c).toBeVisible();
  await expect(c).toHaveAttribute("data-source", "member");
  await expect(c).toContainText("A note from a collaborator.");
  // A member may add and reply, but not triage.
  await expect(c.getByTestId("comment-confirm")).toHaveCount(0);
  await expect(c.getByTestId("comment-complete")).toHaveCount(0);
  await expect(c.getByTestId("comment-reject")).toHaveCount(0);

  // The member's note really reached the server (the revived commenter write-matrix accepted it): the owner
  // sees it in the document's notes projection.
  await expect
    .poll(async () => {
      const r = await page.request.get(`${API}/api/v1/documents/${did}/notes`, { headers: authFor(email) });
      if (!r.ok()) return [];
      return ((await r.json()).data as { commentSource: string }[]).map(n => n.commentSource);
    }, { timeout: 15_000 })
    .toContain("member");

  await ctx.close();
});

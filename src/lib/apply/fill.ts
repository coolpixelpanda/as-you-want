import fs from "node:fs";
import type { Locator, Page } from "playwright";
import type { MappedAnswer } from "@/lib/types";

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function firstVisible(locators: Locator[]) {
  for (const loc of locators) {
    const handle = loc.first();
    if ((await handle.count()) && (await handle.isVisible().catch(() => false))) {
      return handle;
    }
  }
  return null;
}

async function fillText(target: Locator, value: string) {
  await target.click({ timeout: 4000 });
  await target.fill("");
  await target.fill(value);
}

async function chooseOption(page: Page, value: string) {
  const exact = page.getByRole("option", { name: new RegExp(`^${escapeRe(value)}$`, "i") });
  if (await exact.count()) {
    await exact.first().click();
    return true;
  }
  const fuzzy = page.getByRole("option", { name: new RegExp(escapeRe(value), "i") });
  if (await fuzzy.count()) {
    await fuzzy.first().click();
    return true;
  }
  const first = page.getByRole("option").first();
  if (await first.count()) {
    await first.click();
    return true;
  }
  return false;
}

async function fillCombobox(page: Page, label: string, value: string) {
  const combo = page.getByRole("combobox", { name: new RegExp(escapeRe(label), "i") });
  const target = combo.first();
  if (!(await target.count())) return false;
  await target.click();
  await page.waitForTimeout(250);
  const typed = await target.isEditable().catch(() => false);
  if (typed) {
    await target.fill(value);
    await page.waitForTimeout(700);
  }
  const picked = await chooseOption(page, value);
  if (!picked && !typed) {
    await page.keyboard.type(value, { delay: 30 });
    await page.waitForTimeout(500);
    await chooseOption(page, value);
  }
  return true;
}

export async function fillMappedAnswers(page: Page, answers: MappedAnswer[]) {
  const results: { id: string; ok: boolean; error?: string }[] = [];

  for (const answer of answers) {
    if (!answer.value || answer.type === "hidden") {
      results.push({ id: answer.id, ok: !answer.required || Boolean(answer.value) });
      continue;
    }

    try {
      if (answer.type === "file") {
        if (!fs.existsSync(answer.value)) {
          throw new Error(`File not found: ${answer.value}`);
        }
        const fileInput = await firstVisible([
          page.locator(`input[type="file"][name="${answer.name || ""}"]`),
          page.getByLabel(new RegExp(escapeRe(answer.label), "i")).locator("..").locator('input[type="file"]'),
          page.locator('input[type="file"]'),
        ]);
        if (!fileInput) throw new Error("No file input found");
        await fileInput.setInputFiles(answer.value);
        await page.waitForTimeout(1200);
        results.push({ id: answer.id, ok: true });
        continue;
      }

      if (answer.type === "combobox" || answer.type === "select" || answer.type === "multiselect") {
        const native = answer.name
          ? page.locator(`select[name="${answer.name}"]`).first()
          : page.getByLabel(new RegExp(escapeRe(answer.label), "i")).first();
        if ((await native.count()) && (await native.evaluate((el) => el.tagName.toLowerCase()).catch(() => "")) === "select") {
          await native.selectOption({ label: answer.value }).catch(async () => {
            await native.selectOption({ value: answer.value });
          });
          results.push({ id: answer.id, ok: true });
          continue;
        }
        const ok = await fillCombobox(page, answer.label, answer.value);
        if (ok) {
          results.push({ id: answer.id, ok: true });
          continue;
        }
      }

      if (answer.type === "radio" || /^(yes|no)$/i.test(answer.value)) {
        const group = page.getByRole("group", { name: new RegExp(escapeRe(answer.label), "i") });
        const radio = group
          .getByRole("radio", { name: new RegExp(escapeRe(answer.value), "i") })
          .or(page.getByRole("radio", { name: new RegExp(escapeRe(answer.value), "i") }));
        if (await radio.first().count()) {
          await radio.first().check({ force: true }).catch(async () => {
            await radio.first().click();
          });
          results.push({ id: answer.id, ok: true });
          continue;
        }
        const btn = page.getByRole("button", { name: new RegExp(`^${escapeRe(answer.value)}$`, "i") });
        if (await btn.first().count()) {
          await btn.first().click();
          results.push({ id: answer.id, ok: true });
          continue;
        }
      }

      if (answer.type === "checkbox") {
        const box = page.getByRole("checkbox", { name: new RegExp(escapeRe(answer.label), "i") });
        if (await box.count()) {
          const shouldCheck = !/^(no|false|unchecked)$/i.test(answer.value);
          if (shouldCheck) await box.first().check({ force: true });
          else await box.first().uncheck({ force: true }).catch(() => undefined);
          results.push({ id: answer.id, ok: true });
          continue;
        }
      }

      const textTarget = await firstVisible([
        answer.name ? page.locator(`[name="${answer.name}"]`) : page.locator("not-a-real-selector"),
        page.getByRole("textbox", { name: new RegExp(escapeRe(answer.label), "i") }),
        page.getByLabel(new RegExp(escapeRe(answer.label), "i")),
        page.getByPlaceholder(new RegExp(escapeRe(answer.label), "i")),
      ]);

      if (!textTarget) throw new Error("Could not find field");
      await fillText(textTarget, answer.value);
      if (/email/i.test(answer.label) || answer.type === "email") {
        await page.waitForTimeout(900);
      }
      results.push({ id: answer.id, ok: true });
    } catch (error) {
      results.push({
        id: answer.id,
        ok: false,
        error: error instanceof Error ? error.message : "Fill failed",
      });
    }
  }

  return results;
}

export async function submitApplication(page: Page) {
  const submit = page
    .getByRole("button", { name: /submit application|submit|apply now|send application/i })
    .first();
  if (!(await submit.count())) {
    throw new Error("Submit button not found");
  }
  await submit.click();
}

export async function waitForOutcome(page: Page, timeoutMs = 180000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const url = page.url();
    const body = (await page.locator("body").innerText().catch(() => "")).slice(0, 4000);
    if (
      /application_id=|thank you for applying|application submitted|we have received your application|thanks for applying/i.test(
        `${url}\n${body}`,
      )
    ) {
      return { ok: true as const, url, text: body.slice(0, 400) };
    }
    const captcha = page.locator(
      'iframe[src*="recaptcha"], iframe[title*="recaptcha"], iframe[src*="hcaptcha"]',
    );
    if (await captcha.count()) {
      return { ok: false as const, captcha: true, url, text: body.slice(0, 400) };
    }
    await page.waitForTimeout(1500);
  }
  return { ok: false as const, captcha: false, url: page.url(), text: "" };
}

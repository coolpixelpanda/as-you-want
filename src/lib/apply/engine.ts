import fs from "node:fs";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { getApplication, updateApplication } from "@/lib/store";
import { detectJob } from "@/lib/ats/detect";
import { fetchGreenhouseJob } from "@/lib/ats/greenhouse";
import { mapQuestions } from "@/lib/ats/mapper";
import { getProfile, profileCompleteness } from "@/lib/profile";
import { clickApplyIfNeeded, inspectPageForm } from "@/lib/apply/inspect";
import { fillMappedAnswers, submitApplication, waitForOutcome } from "@/lib/apply/fill";
import type { ApplyLog, FormQuestion, MappedAnswer } from "@/lib/types";

const running = new Set<string>();

async function appendLog(id: string, level: ApplyLog["level"], message: string) {
  const app = getApplication(id);
  if (!app) return;
  const logs = JSON.parse(app.logs || "[]") as ApplyLog[];
  logs.push({ t: new Date().toISOString(), level, message });
  updateApplication(id, { logs: JSON.stringify(logs.slice(-200)) });
}

async function setStatus(id: string, data: Record<string, unknown>) {
  updateApplication(id, data);
}

async function launchBrowser(headed: boolean): Promise<{ browser: Browser; page: Page }> {
  const browser = await chromium.launch({
    headless: !headed,
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    locale: "en-US",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();
  return { browser, page };
}

export async function prepareApplication(id: string) {
  if (running.has(id)) return;
  running.add(id);
  try {
    const app = getApplication(id);
    if (!app) return;
    const profile = await getProfile();
    const completeness = profileCompleteness(profile);
    if (!completeness.ready) {
      await setStatus(id, {
        status: "needs_input",
        error: `Finish your profile first: ${completeness.missing.join(", ")}`,
      });
      return;
    }

    await setStatus(id, { status: "inspecting", error: null });
    await appendLog(id, "info", "Detecting the job site and reading the application form.");

    const detected = detectJob(app.jobUrl);
    let title = "";
    let company = "";
    let location = "";
    let questions: FormQuestion[] = [];
    let applyUrl = detected.applyUrl;

    if (detected.ats === "greenhouse") {
      const gh = await fetchGreenhouseJob(app.jobUrl);
      if (gh) {
        title = gh.title;
        company = gh.company;
        location = gh.location;
        questions = gh.questions;
        applyUrl = gh.applyUrl;
        await appendLog(id, "info", `Greenhouse form loaded with ${questions.length} fields.`);
      }
    }

    if (!questions.length) {
      const headed = profile.headedBrowser;
      const { browser, page } = await launchBrowser(headed);
      try {
        await page.goto(applyUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
        await clickApplyIfNeeded(page);
        const inspected = await inspectPageForm(page);
        title = inspected.title || title;
        company = inspected.company || company;
        questions = inspected.questions;
        applyUrl = page.url();
        await appendLog(id, "info", `Read ${questions.length} fields from the live page.`);
      } finally {
        await browser.close();
      }
    }

    await setStatus(id, {
      status: "mapping",
      ats: detected.ats,
      title,
      company,
      location,
      applyUrl,
      questions: JSON.stringify(questions),
    });
    await appendLog(id, "info", "Matching form fields to your profile.");

    const mapped = await mapQuestions({
      questions,
      profile,
      jobTitle: title,
      company,
    });

    const missingRequired = mapped.filter((a) => a.required && !a.value);
    const status = missingRequired.length ? "needs_input" : "ready";
    await setStatus(id, {
      status,
      mappedAnswers: JSON.stringify(mapped),
      error: missingRequired.length
        ? `${missingRequired.length} required field(s) still need an answer.`
        : null,
    });
    await appendLog(
      id,
      missingRequired.length ? "warn" : "info",
      missingRequired.length
        ? `Need answers for: ${missingRequired.map((m) => m.label).join("; ")}`
        : "All required fields mapped. Review and apply when ready.",
    );

    if (status === "ready" && (profile.autoSubmit || profile.fillAndSubmit)) {
      await submitPreparedApplication(id, { submit: true });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Prepare failed";
    await setStatus(id, { status: "failed", error: message });
    await appendLog(id, "error", message);
  } finally {
    running.delete(id);
  }
}

export async function submitPreparedApplication(
  id: string,
  opts: { submit: boolean },
) {
  if (running.has(id)) return;
  running.add(id);
  let browser: Browser | undefined;
  let keepOpen = false;
  try {
    const app = getApplication(id);
    if (!app) return;
    const profile = await getProfile();
    const answers = JSON.parse(app.mappedAnswers || "[]") as MappedAnswer[];
    const missing = answers.filter((a) => a.required && !a.value);
    if (missing.length) {
      await setStatus(id, {
        status: "needs_input",
        error: `Answer required fields first: ${missing.map((m) => m.label).join(", ")}`,
      });
      return;
    }

    await setStatus(id, { status: "applying", error: null });
    await appendLog(id, "info", "Opening the job page in the browser.");

    const launched = await launchBrowser(profile.headedBrowser);
    browser = launched.browser;
    const page = launched.page;
    const target = app.applyUrl || app.jobUrl;
    await page.goto(target, { waitUntil: "domcontentloaded", timeout: 45000 });
    await clickApplyIfNeeded(page);
    await appendLog(id, "info", "Filling the application form from your profile.");
    const fillResults = await fillMappedAnswers(page, answers);
    const failed = fillResults.filter((r) => !r.ok);
    if (failed.length) {
      await appendLog(
        id,
        "warn",
        `Could not fill ${failed.length} field(s): ${failed
          .map((f) => f.id)
          .slice(0, 8)
          .join(", ")}`,
      );
    }

    const shotDir = path.join(process.cwd(), "data", "screenshots");
    fs.mkdirSync(shotDir, { recursive: true });
    const shotPath = path.join(shotDir, `${id}.png`);
    await page.screenshot({ path: shotPath, fullPage: true }).catch(() => undefined);
    await setStatus(id, { screenshotPath: shotPath });

    if (!opts.submit) {
      keepOpen = true;
      await appendLog(
        id,
        "info",
        "Form filled. The browser will stay open so you can review and submit.",
      );
      await setStatus(id, { status: "needs_action" });
      await page.waitForTimeout(300000).catch(() => undefined);
      return;
    }

    await appendLog(id, "info", "Submitting the application.");
    await submitApplication(page);
    const outcome = await waitForOutcome(page, 180000);
    if (outcome.ok) {
      await setStatus(id, {
        status: "submitted",
        confirmationUrl: outcome.url,
        confirmationText: outcome.text,
        error: null,
      });
      await appendLog(id, "info", "Application submitted.");
      return;
    }
    if (outcome.captcha) {
      keepOpen = true;
      await setStatus(id, {
        status: "needs_action",
        error: "Complete the captcha in the open browser window, then the app will continue watching.",
      });
      await appendLog(id, "warn", "Captcha shown. Waiting up to 3 minutes for you to complete it.");
      const after = await waitForOutcome(page, 180000);
      if (after.ok) {
        await setStatus(id, {
          status: "submitted",
          confirmationUrl: after.url,
          confirmationText: after.text,
          error: null,
        });
        await appendLog(id, "info", "Application submitted after captcha.");
        return;
      }
    }
    keepOpen = true;
    await setStatus(id, {
      status: "needs_action",
      error: "Could not confirm submission. Check the open browser window.",
      confirmationUrl: outcome.url,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Apply failed";
    await setStatus(id, { status: "failed", error: message });
    await appendLog(id, "error", message);
  } finally {
    running.delete(id);
    if (!keepOpen) {
      await browser?.close().catch(() => undefined);
    }
  }
}

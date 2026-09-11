(() => {
  if (window.__joblinkLoaded) return;
  window.__joblinkLoaded = true;

  const isTop = (() => {
    try {
      return window.top === window;
    } catch {
      return false;
    }
  })();

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function extensionAlive() {
    try {
      return Boolean(chrome?.runtime?.id);
    } catch {
      return false;
    }
  }

  function realClick(el) {
    if (!el) return false;
    const opts = { bubbles: true, cancelable: true, view: window, composed: true };
    el.scrollIntoView?.({ block: "center", inline: "nearest" });
    el.focus?.();
    el.dispatchEvent(new MouseEvent("pointerdown", opts));
    el.dispatchEvent(new MouseEvent("mousedown", opts));
    el.dispatchEvent(new MouseEvent("pointerup", opts));
    el.dispatchEvent(new MouseEvent("mouseup", opts));
    el.dispatchEvent(new MouseEvent("click", opts));
    if (typeof el.click === "function") el.click();
    return true;
  }

  function robotStateInThisFrame() {
    try {
      if (!document || typeof document.querySelector !== "function") {
        return { present: false, solved: false };
      }
      let anchor = null;
      try {
        anchor = document.querySelector("#recaptcha-anchor");
      } catch {
        anchor = null;
      }
      if (!anchor) {
        try {
          anchor = document.querySelector(".recaptcha-checkbox[role='checkbox']");
        } catch {
          anchor = null;
        }
      }
      if (anchor) {
        let solved = false;
        try {
          solved =
            anchor.getAttribute("aria-checked") === "true" ||
            Boolean(anchor.classList && anchor.classList.contains("recaptcha-checkbox-checked"));
        } catch {
          solved = false;
        }
        return { present: true, solved };
      }
      let hcap = null;
      try {
        hcap = document.querySelector("#checkbox[role='checkbox']");
      } catch {
        hcap = null;
      }
      if (hcap) {
        let solved = false;
        try {
          solved = hcap.getAttribute("aria-checked") === "true";
        } catch {
          solved = false;
        }
        return { present: true, solved };
      }
    } catch {
      /* sandboxed / recaptcha frames can block DOM access */
    }
    return { present: false, solved: false };
  }

  if (!isTop) {
    let host = "";
    try {
      host = String(location.hostname || "");
    } catch {
      return;
    }
    if (!/recaptcha|hcaptcha/i.test(host)) return;

    const watch = () => {
      try {
        if (!extensionAlive()) return;
        const state = robotStateInThisFrame();
        if (!state.present) return;
        chrome.runtime.sendMessage(
          { type: "ROBOT_FRAME", present: state.present, solved: state.solved },
          () => {
            void chrome.runtime.lastError;
          },
        );
      } catch {
        /* ignore */
      }
    };
    watch();
    const timer = setInterval(() => {
      if (!extensionAlive()) {
        clearInterval(timer);
        return;
      }
      watch();
    }, 2000);
    return;
  }

  let running = false;
  let confirming = false;
  let fillingNow = false;
  let savePromptOpen = false;
  let stopMissedWatch = null;
  let didClickSubmit = false;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "START_APPLY") {
      if (!running) void runApply(message);
      sendResponse({ ok: true });
    }
    if (message.type === "CONFIRM_APPLIED") {
      void confirmAppliedOnListing();
      sendResponse({ ok: true });
    }
    return true;
  });

  function overlay() {
    let el = document.getElementById("joblink-overlay");
    if (!el) {
      el = document.createElement("div");
      el.id = "joblink-overlay";
      el.innerHTML = "<strong>JobLink</strong><div class='joblink-log'></div>";
      document.documentElement.appendChild(el);
    }
    return el;
  }

  function log(text) {
    const box = overlay().querySelector(".joblink-log");
    const line = document.createElement("div");
    line.textContent = text;
    box.prepend(line);
    chrome.runtime.sendMessage({ type: "APPLY_STATUS", text });
  }

  function visible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 1 && rect.height > 1;
  }

  function queryDeep(selector, root = document) {
    const found = [];
    const visit = (node) => {
      if (!node?.querySelectorAll) return;
      found.push(...node.querySelectorAll(selector));
      node.querySelectorAll("*").forEach((child) => {
        if (child.shadowRoot) visit(child.shadowRoot);
      });
    };
    visit(root);
    return found;
  }

  const APPLIED_YES =
    /yes,?\s*i(\s*have)?\s*applied!?|i(\s*have)?\s*applied!?|already applied|confirm (that )?i applied|yes,?\s*i did/i;

  function findAppliedConfirmButton() {
    const roots = [
      ...queryDeep(
        '[role="dialog"], [aria-modal="true"], .artdeco-modal, [class*="modal"], [class*="dialog"], [class*="Modal"]',
      ),
      document.body,
    ].filter(Boolean);
    for (const root of roots) {
      if (root !== document.body && !visible(root) && root.getClientRects?.().length === 0) continue;
      const buttons = [...root.querySelectorAll("button, a, [role='button'], input[type='button']")];
      const yesApplied = buttons.find((el) => {
        const label = `${el.innerText || el.value || el.getAttribute("aria-label") || ""}`.replace(/\s+/g, " ").trim();
        return visible(el) && APPLIED_YES.test(label);
      });
      if (yesApplied) return yesApplied;
      const asks = /did you apply|have you applied|applied (to|for) this|confirm you applied|did you submit/i.test(
        root.innerText || "",
      );
      if (asks) {
        const yes = buttons.find((el) => {
          const label = `${el.innerText || el.value || el.getAttribute("aria-label") || ""}`.replace(/\s+/g, " ").trim();
          return visible(el) && /^(yes|yes!?|confirm)$/i.test(label);
        });
        if (yes) return yes;
      }
    }
    return null;
  }

  async function confirmAppliedOnListing() {
    if (confirming) return false;
    confirming = true;
    overlay();
    log('Looking for “Yes, I applied!”…');
    const start = Date.now();
    while (Date.now() - start < 25000) {
      const btn = findAppliedConfirmButton();
      if (btn) {
        realClick(btn);
        log("Clicked Yes, I applied!");
        await chrome.storage.session.remove("pendingConfirm");
        confirming = false;
        return true;
      }
      await sleep(2000);
    }
    log("No apply-confirmation modal appeared.");
    await chrome.storage.session.remove("pendingConfirm");
    confirming = false;
    return false;
  }

  chrome.storage.session.get(["pendingConfirm", "applyJob"]).then((data) => {
    if (data.applyJob) return;
    if (data.pendingConfirm && Date.now() < (data.pendingConfirm.until || 0)) {
      void confirmAppliedOnListing();
    }
  });

  const POLL_MS = 2500;

  function pageBusy() {
    return queryDeep(
      '[aria-busy="true"], [data-automation-id="loading"], [data-automation-id="loadingPage"], [data-automation-id="busyIndicator"], .wd-loading',
    ).some((el) => {
      if (!visible(el)) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 60 && rect.height > 60;
    });
  }

  function controlText(el) {
    return `${el.innerText || ""} ${el.value || ""} ${el.getAttribute("aria-label") || ""} ${el.getAttribute("title") || ""} ${el.getAttribute("data-automation-id") || ""}`
      .replace(/\s+/g, " ")
      .trim();
  }

  function findEasyApplyButton() {
    const details = queryDeep(
      ".jobs-search__job-details button.jobs-apply-button, .jobs-details button.jobs-apply-button, .job-view-layout button.jobs-apply-button, .jobs-unified-top-card button.jobs-apply-button, button.jobs-apply-button",
    ).find((el) => {
      if (!visible(el) || el.disabled || el.getAttribute("aria-disabled") === "true") return false;
      const text = controlText(el);
      return /easy apply/i.test(text) && !/already applied|^applied$/i.test(text);
    });
    return details || null;
  }

  function findApplyButton() {
    const easy = findEasyApplyButton();
    if (easy) return easy;
    const specific = queryDeep(
      '[data-automation-id="jobPostingApplyButton"], [data-automation-id="adventureButton"], .jobs-apply-button, button.jobs-apply-button, a[href*="apply"][data-qa], #apply_button, a.postings-btn',
    ).find((el) => {
      if (!visible(el) || el.disabled || el.getAttribute("aria-disabled") === "true") return false;
      return !/already applied|^applied$/i.test(controlText(el));
    });
    if (specific) return specific;

    const scored = [];
    for (const el of queryDeep("button, a, [role='button'], input[type='button'], input[type='submit']")) {
      if (!visible(el) || el.disabled || el.getAttribute("aria-disabled") === "true") continue;
      const text = controlText(el);
      if (!text) continue;
      if (text.length > 120 && !/easy apply|apply now|\bapply\b/i.test(text)) continue;
      if (/already applied|^applied$|application submitted|don't apply|do not apply|how to apply|applicants|save job|^save$|share|follow|remind/i.test(text)) {
        continue;
      }
      if (/easy apply/i.test(text)) scored.push({ el, score: 4 });
      else if (/apply now|apply for this job|apply to this job/i.test(text)) scored.push({ el, score: 4 });
      else if (/^apply$/i.test(text)) scored.push({ el, score: 3 });
      else if (/^i.?m interested$/i.test(text)) scored.push({ el, score: 2 });
      else if (/\bapply\b/i.test(text) && text.length < 60) scored.push({ el, score: 1 });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.el || null;
  }

  function fillableControls() {
    return queryDeep(
      "input, textarea, select, [role='combobox'], [data-automation-id*='textInput'], [contenteditable='true']",
    ).filter((el) => {
      const type = (el.getAttribute("type") || el.tagName.toLowerCase()).toLowerCase();
      if (["hidden", "submit", "button", "image", "reset", "search"].includes(type)) return false;
      if (el.type === "file") return true;
      return visible(el);
    });
  }

  const NAME_FIELD_SEL = [
    "#first_name",
    "#last_name",
    "#full_name",
    'input[name="first_name"]',
    'input[name="last_name"]',
    'input[name*="first_name"]',
    'input[name*="last_name"]',
    'input[name*="firstName"]',
    'input[name*="lastName"]',
    'input[autocomplete="given-name"]',
    'input[autocomplete="family-name"]',
    'input[autocomplete="name"]',
    'input[id*="firstName"]',
    'input[id*="lastName"]',
    'input[id*="first_name"]',
    'input[id*="last_name"]',
    '[data-automation-id*="legalName"] input',
    '[data-automation-id*="nameInput"]',
  ].join(", ");

  function fieldBlob(el) {
    return `${labelOf(el)} ${el.getAttribute("name") || ""} ${el.id || ""} ${el.getAttribute("placeholder") || ""} ${el.getAttribute("autocomplete") || ""} ${el.getAttribute("data-automation-id") || ""}`.toLowerCase();
  }

  function looksLikeApplyForm() {
    const titles = [...document.querySelectorAll("h1, h2, h3")].map((el) => el.innerText || "").join(" ");
    if (/apply for this job|application form|submit your application/i.test(titles)) return true;
    return Boolean(
      document.querySelector("form#application-form, form#application, #application_form, form.application-form"),
    );
  }

  function hasNameOrRequiredBoxes() {
    if (queryDeep(NAME_FIELD_SEL).some(visible)) return true;
    const boxes = fillableControls();
    const nameLike = boxes.filter((el) =>
      /full\s*name|first.?name|last.?name|given.?name|family.?name|legal.?name|preferred.?name/.test(fieldBlob(el)),
    );
    const required = boxes.filter(
      (el) => el.type !== "hidden" && (el.required || el.getAttribute("aria-required") === "true" || /\*/.test(labelOf(el))),
    );
    const identity = boxes.filter((el) => /e-?mail|phone|mobile/.test(fieldBlob(el)));
    return nameLike.length > 0 || required.length > 0 || identity.length >= 2;
  }

  function inApplyModalOrUrl() {
    if (/\/apply\b|easy-?apply|jobapplication|applicationform/i.test(location.href)) return true;
    return queryDeep(
      '[role="dialog"], .jobs-easy-apply-modal, .artdeco-modal, [data-automation-id="applyFlowPage"], [data-automation-id="applyFlow"]',
    ).some(visible);
  }

  function formReady() {
    if (hasNameOrRequiredBoxes()) return true;
    if (looksLikeApplyForm() && fillableControls().length > 0) return true;
    if (inApplyModalOrUrl() && fillableControls().length > 0) return true;
    return false;
  }

  function alreadyOnApplication() {
    return formReady();
  }

  async function waitForDocumentComplete(timeout = 30000) {
    const start = Date.now();
    if (document.readyState !== "complete") {
      await new Promise((resolve) => {
        if (document.readyState === "complete") return resolve();
        window.addEventListener("load", () => resolve(), { once: true });
        setTimeout(resolve, timeout);
      });
    }
    while (Date.now() - start < timeout && document.readyState !== "complete") {
      await sleep(100);
    }
  }

  async function waitUntil(check, { timeout = 60000, message = "" } = {}) {
    const immediate = check();
    if (immediate) return immediate;
    if (document.readyState !== "complete") {
      await waitForDocumentComplete(Math.min(timeout, 8000));
      const afterLoad = check();
      if (afterLoad) return afterLoad;
    }
    const start = Date.now();
    let lastLog = 0;
    while (Date.now() - start < timeout) {
      const hit = check();
      if (hit) return hit;
      if (message && Date.now() - lastLog > 4000) {
        lastLog = Date.now();
        log(message);
      }
      await sleep(POLL_MS);
    }
    return check();
  }

  function recaptchaChallengeOpen() {
    return queryDeep('iframe[src*="recaptcha"], iframe[src*="hcaptcha"]').some((el) => {
      const hint = `${el.getAttribute("title") || ""} ${el.getAttribute("src") || ""}`.toLowerCase();
      return visible(el) && /bframe|challenge/.test(hint);
    });
  }

  function recaptchaWidgetVisible() {
    return queryDeep(
      'iframe[src*="recaptcha"], iframe[title*="reCAPTCHA"], iframe[src*="hcaptcha"], iframe[title*="hCaptcha"]',
    ).some(visible);
  }

  function recaptchaTokenPresent() {
    return queryDeep("#g-recaptcha-response, textarea[name='g-recaptcha-response'], textarea[name='h-captcha-response']").some(
      (el) => (el.value || el.textContent || "").trim().length > 20,
    );
  }

  async function needsHumanCheck(forSubmit = false) {
    if (recaptchaTokenPresent()) return false;
    if (recaptchaChallengeOpen()) return true;
    if (!forSubmit) return false;
    try {
      const { robotFrame } = await chrome.storage.session.get("robotFrame");
      if (robotFrame?.present) return !robotFrame.solved;
    } catch {
      /* ignore */
    }
    return recaptchaWidgetVisible();
  }

  async function waitIfHumanCheck(forSubmit = false) {
    if (!(await needsHumanCheck(forSubmit))) return;
    log("Human check: click I'm not a robot. I'll keep checking every 2 seconds.");
    while (await needsHumanCheck(forSubmit)) {
      await sleep(2000);
    }
    log("Human check done. Continuing.");
  }

  function clickText(patterns) {
    const rx = patterns instanceof RegExp ? patterns : new RegExp(patterns, "i");
    const candidates = [
      ...queryDeep("button, a, [role='button'], input[type='button'], input[type='submit']"),
      ...queryDeep("[data-automation-id]"),
    ];
    const match = candidates.find((el) => {
      const text = `${el.innerText || el.value || el.getAttribute("aria-label") || ""}`.trim();
      return visible(el) && rx.test(text) && !/save for later|cancel|back|decline/i.test(text);
    });
    if (match) {
      realClick(match);
      return match;
    }
    return null;
  }

  async function dismissCookies() {
    clickText(/accept cookies|accept all|allow all|agree|got it/i);
    await sleep(400);
  }

  function pageMeta() {
    if (isLinkedIn()) {
      const title = (
        document.querySelector(
          ".job-details-jobs-unified-top-card__job-title, .jobs-unified-top-card__job-title, h1",
        )?.innerText || ""
      ).trim();
      const company = (
        document.querySelector(
          ".job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__company-name, a.job-details-jobs-unified-top-card__company-name",
        )?.innerText || ""
      ).trim();
      return { title: title || document.title.split("|")[0].trim(), company, host: location.hostname };
    }
    const h1 = document.querySelector("h1")?.innerText?.trim() || "";
    return {
      title: h1 || document.title.split("|")[0].trim(),
      company:
        document.querySelector('[class*="company"], [data-automation-id*="company"]')?.textContent?.trim() || "",
      host: location.hostname,
    };
  }

  function isLinkedIn() {
    return /linkedin\.com/i.test(location.hostname);
  }

  function isWorkday() {
    return (
      /myworkdayjobs|workday/i.test(location.hostname + location.pathname) ||
      Boolean(document.querySelector("[data-automation-id]"))
    );
  }

  async function startOnListing(opts) {
    await dismissCookies();
    if (isLinkedIn()) {
      log("Checking every 2–3 seconds for Easy Apply on this job…");
      const ready = await waitUntil(
        () => alreadyOnApplication() || findEasyApplyButton() || confirmation(),
        { timeout: 90000, message: "Looking for Easy Apply on the job details…" },
      );
      if (confirmation()) return true;
      if (alreadyOnApplication()) {
        log("The Easy Apply form is already open.");
      } else if (ready || findEasyApplyButton()) {
        const btn = findEasyApplyButton();
        if (btn) {
          realClick(btn);
          log("Clicked Easy Apply. Waiting for the application modal…");
          const form = await waitUntil(() => alreadyOnApplication() || confirmation(), {
            timeout: 90000,
            message: "Waiting for first name and contact fields…",
          });
          if (!form && !alreadyOnApplication() && !confirmation()) {
            log("Easy Apply did not open.");
            return false;
          }
        }
      } else {
        log("No Easy Apply button on this job. Pick a job that supports Easy Apply.");
        return false;
      }
      await waitUntil(() => formReady() || confirmation(), {
        timeout: 60000,
        message: "Waiting until required fields are ready to fill…",
      });
      return formReady() || confirmation();
    }
    log("Checking every 2–3 seconds for Apply / Apply Now…");
    const ready = await waitUntil(
      () => alreadyOnApplication() || findApplyButton() || confirmation(),
      { timeout: 90000, message: "Page is up. Looking for Apply or Apply Now…" },
    );
    if (confirmation()) return true;
    if (alreadyOnApplication()) {
      log("Full name or required boxes are already available.");
    } else if (ready || findApplyButton()) {
      const btn = findApplyButton();
      if (btn) {
        const label = controlText(btn).slice(0, 40) || "Apply";
        realClick(btn);
        log(`Clicked “${label}”. Waiting for full name or other required boxes…`);
        const form = await waitUntil(() => alreadyOnApplication() || confirmation(), {
          timeout: 90000,
          message: "Waiting for full name or other required boxes…",
        });
        if (!form && !alreadyOnApplication() && !confirmation()) {
          log("The form did not open on this page. If a new tab opened, I will continue there.");
          return false;
        }
      }
    } else {
      log("No Apply / Apply Now button found.");
      return false;
    }
    if (opts.useResume) {
      const autofill = clickText(/autofill with resume|auto-fill with resume|use resume/i);
      if (autofill) {
        log("Clicked Autofill with Resume.");
        await waitUntil(() => formReady() || confirmation(), { timeout: 25000 });
      }
    } else {
      const manual = clickText(/apply manually|apply without|continue without/i);
      if (manual) log("Clicked Apply Manually.");
    }
    await waitUntil(() => formReady() || confirmation(), {
      timeout: 60000,
      message: "Waiting until required fields are ready to fill…",
    });
    return formReady() || confirmation();
  }

  function cleanText(s) {
    return `${s || ""}`.replace(/\s+/g, " ").trim();
  }

  function isNoiseText(s) {
    const t = cleanText(s);
    if (!t || t.length < 2) return true;
    return /^(attach|dropbox|enter manually|google drive|onedrive|browse|upload|select|choose file|optional|required|\*|yes|no)$/i.test(
      t,
    );
  }

  function fieldBox(el) {
    return (
      el.closest(
        '[data-automation-id*="formField"], [class*="form-field"], [class*="formField"], [class*="question"], [class*="application-question"], .field, .form-group, fieldset, li',
      ) || el.parentElement
    );
  }

  function isChoiceLabel(s) {
    return /^(yes|no|true|false|y|n)$/i.test(cleanText(s));
  }

  function questionFromAround(el) {
    const box = fieldBox(el);
    const consider = (node) => {
      if (!node || node === el || node.contains?.(el)) return "";
      const t = cleanText(node.innerText || node.textContent);
      if (!t || isChoiceLabel(t) || isNoiseText(t) || t.length < 8 || t.length > 500) return "";
      return t;
    };
    if (box) {
      const heading = box.querySelector(":scope > label, :scope > legend, :scope > p, :scope > h2, :scope > h3, :scope > h4, :scope > [class*='label']");
      const fromHeading = consider(heading);
      if (fromHeading) return fromHeading;
      for (const node of box.querySelectorAll("label, legend, p, h2, h3, h4, [class*='label']")) {
        if (node.contains(el)) continue;
        const t = consider(node);
        if (t) return t;
      }
    }
    let node = el.parentElement;
    for (let i = 0; i < 6 && node && node !== document.body; i += 1) {
      let prev = node.previousElementSibling;
      for (let j = 0; j < 4 && prev; j += 1) {
        const t = consider(prev);
        if (t) return t;
        prev = prev.previousElementSibling;
      }
      node = node.parentElement;
    }
    return "";
  }

  function questionContext(el) {
    const choiceControl = el.matches?.("input[type='radio'], input[type='checkbox'], [role='radio']");
    let question = "";
    let description = "";
    const id = el.getAttribute("id");
    if (id && !choiceControl) {
      try {
        const lab = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (lab) question = cleanText(lab.innerText);
      } catch {
        /* ignore */
      }
    }
    if (!question && !choiceControl) {
      const wrap = el.closest("label");
      if (wrap) question = cleanText(wrap.innerText);
    }
    if (isChoiceLabel(question)) question = "";
    if (!question && el.getAttribute("aria-label") && !isChoiceLabel(el.getAttribute("aria-label"))) {
      question = cleanText(el.getAttribute("aria-label"));
    }
    if (!question && el.getAttribute("aria-labelledby") && !choiceControl) {
      question = cleanText(
        el
          .getAttribute("aria-labelledby")
          .split(/\s+/)
          .map((lid) => document.getElementById(lid)?.innerText || "")
          .join(" "),
      );
    }
    if (isChoiceLabel(question)) question = "";

    const box = fieldBox(el);
    if (box) {
      const help = [...box.querySelectorAll("p, span, div, small")].find((node) => {
        if (node === el || node.contains(el)) return false;
        const cls = `${node.className || ""} ${node.getAttribute("data-automation-id") || ""}`.toLowerCase();
        return /description|helper|help-text|hint|subtitle|instruction/.test(cls);
      });
      if (help) description = cleanText(help.innerText);

      if (!question) {
        const qEl = [...box.querySelectorAll("label, legend, h2, h3, h4, [class*='label']")].find((node) => {
          if (node === el || node.contains(el)) return false;
          const t = node.innerText;
          return !isNoiseText(t) && !isChoiceLabel(t);
        });
        if (qEl) question = cleanText(qEl.innerText);
      }
    }

    if (!question || isChoiceLabel(question)) {
      question = questionFromAround(el);
    }

    if (!question) {
      let prev = el.previousElementSibling;
      for (let i = 0; i < 5 && prev; i += 1) {
        if (prev.matches("input, textarea, select, button")) {
          prev = prev.previousElementSibling;
          continue;
        }
        const t = cleanText(prev.innerText);
        if (t && t.length > 3 && t.length < 600 && !isNoiseText(t) && !isChoiceLabel(t)) {
          question = t;
          break;
        }
        prev = prev.previousElementSibling;
      }
    }

    if (question && !description) {
      const lines = question
        .split(/(?<=\?)\s+/)
        .map(cleanText)
        .filter(Boolean);
      if (lines.length > 1 && lines[0].length > 8) {
        question = lines[0];
        description = lines.slice(1).join(" ");
      }
    }
    if (description && question.includes(description) && description.length > 12) {
      question = cleanText(question.replace(description, ""));
    }
    question = question.replace(/\s*\*\s*$/g, "").trim();
    if (isChoiceLabel(question)) question = questionFromAround(el) || "";
    return {
      question: (question || (!choiceControl ? cleanText(el.getAttribute("placeholder")) : "") || "").slice(0, 500),
      description: description.slice(0, 500),
    };
  }

  function labelOf(el) {
    return questionContext(el).question;
  }

  function inspectFields() {
    const fields = [];
    const seen = new Set();
    let n = 0;
    const tag = (el) => {
      const id = `jl-${n}`;
      n += 1;
      try {
        el.setAttribute("data-joblink-id", id);
      } catch {
        /* ignore */
      }
      return id;
    };
    const push = (item) => {
      const key = `${item.id}|${item.name}|${item.label}|${item.type}`;
      if (!item.label || seen.has(key)) return;
      seen.add(key);
      fields.push(item);
    };

    queryDeep("input, textarea, select, [role='combobox'], [role='textbox'], [data-automation-id*='textInput']").forEach(
      (el, i) => {
        const type = (el.getAttribute("type") || el.tagName.toLowerCase()).toLowerCase();
        if (["hidden", "submit", "button", "image", "reset", "search"].includes(type)) return;
        if (type === "radio") return;
        if (type === "file") return;
        const tagName = el.tagName.toLowerCase();
        if (
          !["input", "textarea", "select"].includes(tagName) &&
          el.getAttribute("role") !== "combobox" &&
          el.getAttribute("role") !== "textbox" &&
          !el.isContentEditable
        ) {
          return;
        }
        if (!visible(el) && el.getAttribute("role") !== "combobox") return;
        const ctx = questionContext(el);
        const name = el.getAttribute("name") || el.getAttribute("data-automation-id") || `field_${i}`;
        const label = ctx.question || el.getAttribute("placeholder") || name;
        let options = [];
        if (el.tagName === "SELECT") {
          options = [...el.options]
            .map((o) => ({ label: o.text.trim(), value: o.value }))
            .filter((o) => o.label && !/^select/i.test(o.label));
        }
        push({
          id: tag(el),
          name,
          label,
          description: ctx.description,
          required: el.required || el.getAttribute("aria-required") === "true" || /\*/.test(label),
          type:
            el.tagName === "SELECT" || el.getAttribute("role") === "combobox"
              ? "select"
              : type === "checkbox"
                ? "checkbox"
                : el.tagName === "TEXTAREA" || el.getAttribute("role") === "textbox"
                  ? "textarea"
                  : type === "email"
                    ? "email"
                    : "text",
          options,
        });
      },
    );

    const radiosByName = new Map();
    queryDeep("input[type='radio'], [role='radio']").forEach((el) => {
      if (!visible(el)) return;
      const name = el.getAttribute("name") || el.getAttribute("data-automation-id") || "radio";
      if (!radiosByName.has(name)) radiosByName.set(name, []);
      radiosByName.get(name).push(el);
    });
    radiosByName.forEach((radios, name) => {
      const first = radios[0];
      const ctx = questionContext(first);
      const legend = first.closest("fieldset, [role='radiogroup']")?.querySelector("legend, label, h3, h4");
      let label = cleanText(legend?.innerText);
      if (isChoiceLabel(label)) label = "";
      label = label || ctx.question || questionFromAround(first);
      if (!label || isChoiceLabel(label)) return;
      push({
        id: tag(first),
        name,
        label,
        description: ctx.description,
        required: true,
        type: "radio",
        options: radios.map((r) => ({
          label: cleanText(r.labels?.[0]?.innerText || r.getAttribute("aria-label") || r.value || r.nextSibling?.textContent),
          value: r.value || r.getAttribute("aria-label") || "",
        })),
      });
    });

    return fields;
  }

  function setNativeValue(el, value) {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    el.focus();
    setter ? setter.call(el, value) : (el.value = value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.blur();
  }

  async function chooseOption(value) {
    await sleep(250);
    const options = queryDeep("[role='option'], [data-automation-id='promptOption'], li, [class*='option']");
    const hit = options.find((el) => visible(el) && new RegExp(`^\\s*${escapeRe(value)}\\s*$`, "i").test(el.innerText || ""));
    const fuzzy = options.find((el) => visible(el) && new RegExp(escapeRe(value), "i").test(el.innerText || ""));
    (hit || fuzzy)?.click();
  }

  function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  async function fillOne(answer) {
    if (!answer?.value || answer.type === "file") return false;
    const byJoblink = answer.id ? queryDeep(`[data-joblink-id="${CSS.escape(answer.id)}"]`)[0] : null;
    const byName = answer.name
      ? queryDeep(`[name="${CSS.escape(answer.name)}"], [data-automation-id="${CSS.escape(answer.name)}"]`)[0]
      : null;
    const byLabel = queryDeep("input, textarea, select, [role='combobox'], [role='textbox']").find((el) => {
      const lab = labelOf(el).toLowerCase();
      return visible(el) && lab && answer.label && lab.includes(String(answer.label).toLowerCase().slice(0, 32));
    });
    const el = byJoblink || byName || byLabel;

    if (answer.type === "radio" || (!el && answer.options?.length)) {
      const radio = queryDeep("input[type='radio'], [role='radio']").find((r) => {
        const lab = cleanText(r.labels?.[0]?.innerText || r.getAttribute("aria-label") || r.value || "");
        return visible(r) && lab && new RegExp(`^${escapeRe(answer.value)}$`, "i").test(lab);
      });
      if (radio) {
        realClick(radio);
        return true;
      }
    }

    if (!el) {
      clickText(new RegExp(`^${escapeRe(answer.value)}$`, "i"));
      return false;
    }

    if (el.tagName === "SELECT") {
      const opt = [...el.options].find(
        (o) => o.text.trim() === answer.value || o.value === answer.value || o.text.trim().toLowerCase() === answer.value.toLowerCase(),
      );
      if (opt) el.value = opt.value;
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
    if (el.getAttribute("role") === "combobox" || el.getAttribute("aria-haspopup") === "listbox") {
      el.click();
      await sleep(200);
      if (el.isContentEditable || el.tagName === "INPUT") setNativeValue(el, answer.value);
      await chooseOption(answer.value);
      return true;
    }
    if (el.type === "radio" || el.type === "checkbox") {
      realClick(el);
      return true;
    }
    setNativeValue(el, answer.value);
    if (/email/i.test(answer.label || "")) await sleep(400);
    return true;
  }

  function fieldCurrentValue(field) {
    const tagged = field.id ? queryDeep(`[data-joblink-id="${CSS.escape(field.id)}"]`)[0] : null;
    if (field.type === "radio") {
      const radios = field.name
        ? queryDeep(`input[type="radio"][name="${CSS.escape(field.name)}"]`)
        : [];
      const checked = radios.find((r) => r.checked) || (tagged && tagged.checked ? tagged : null);
      if (!checked) return "";
      return cleanText(
        checked.labels?.[0]?.innerText || checked.getAttribute("aria-label") || checked.value || "Yes",
      );
    }
    if (!tagged) return "";
    if (tagged.type === "checkbox") return tagged.checked ? "Yes" : "";
    if (tagged.tagName === "SELECT") {
      const opt = tagged.options[tagged.selectedIndex];
      const t = (opt?.text || "").trim();
      if (!t || /^select/i.test(t)) return "";
      return t;
    }
    return cleanText(tagged.value || "");
  }

  function askSaveAnswer(question, answer) {
    return new Promise((resolve) => {
      document.getElementById("joblink-save-modal")?.remove();
      savePromptOpen = true;
      const modal = document.createElement("div");
      modal.id = "joblink-save-modal";
      modal.innerHTML = `
        <p class="joblink-save-kicker">JobLink</p>
        <p class="joblink-save-title">Save this answer for future applications?</p>
        <p class="joblink-save-q"><strong>Question</strong> ${escapeHtml(question)}</p>
        <p class="joblink-save-a"><strong>Answer</strong> ${escapeHtml(answer)}</p>
        <div class="joblink-save-actions">
          <button type="button" class="joblink-save-yes">Save</button>
          <button type="button" class="joblink-save-no">Not now</button>
        </div>
      `;
      document.documentElement.appendChild(modal);
      const done = (value) => {
        modal.remove();
        savePromptOpen = false;
        resolve(value);
      };
      modal.querySelector(".joblink-save-yes").addEventListener("click", () => done(true));
      modal.querySelector(".joblink-save-no").addEventListener("click", () => done(false));
    });
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function controlFromEvent(target) {
    if (!target || !target.closest) return null;
    const input = target.closest("input, textarea, select, [role='radio'], [role='combobox']");
    if (input) return input;
    const lab = target.closest("label");
    if (lab?.htmlFor) return document.getElementById(lab.htmlFor);
    return lab?.querySelector("input, textarea, select") || null;
  }

  function isIdentityField(field) {
    const n = `${field.name || ""} ${field.label || ""}`.toLowerCase();
    return /first name|last name|full name|preferred name|^e-?mail$|phone number|^phone$|linkedin|github/.test(n)
      && !/\?/.test(field.label || "");
  }

  function watchManualAnswers(fields, autoFilled, profileId) {
    const autoValue = new Map(Object.entries(autoFilled || {}));
    const prompted = new Set();
    const handler = async (event) => {
      if (fillingNow || !running) return;
      const el = controlFromEvent(event.target);
      if (!el) return;
      const jobId = el.getAttribute("data-joblink-id");
      const field =
        fields.find((f) => f.id && f.id === jobId) ||
        fields.find((f) => f.name && el.getAttribute("name") && f.name === el.getAttribute("name"));
      if (!field || isIdentityField(field) || prompted.has(field.id)) return;
      await sleep(50);
      const value = fieldCurrentValue(field);
      if (!value) return;
      if (autoValue.get(field.id) === value) return;
      prompted.add(field.id);
      let question = field.label;
      if (!question || isChoiceLabel(question)) {
        question = questionContext(el).question || questionFromAround(el) || question;
      }
      if (!question || isChoiceLabel(question)) {
        log("Could not read the question text for that answer.");
        prompted.delete(field.id);
        return;
      }
      log(`You answered: ${String(question).slice(0, 80)}`);
      const save = await askSaveAnswer(question, value);
      if (save) {
        const res = await chrome.runtime.sendMessage({
          type: "SAVE_ANSWER",
          profileId,
          question,
          answer: value,
        });
        if (res?.error) log(res.error);
        else {
          autoValue.set(field.id, value);
          log("Saved that answer. I’ll reuse it on the next application.");
        }
      }
    };
    document.addEventListener("change", handler, true);
    document.addEventListener("focusout", handler, true);
    document.addEventListener("click", handler, true);
    return () => {
      document.removeEventListener("change", handler, true);
      document.removeEventListener("focusout", handler, true);
      document.removeEventListener("click", handler, true);
    };
  }

  async function waitUntilPageFilled(fields, skippedIds) {
    const requiredMissed = fields.filter((f) => f.required && skippedIds.includes(f.id));
    if (!requiredMissed.length) {
      await sleep(1200);
      return;
    }
    log("Waiting for you to finish the remaining questions…");
    await waitUntil(
      () =>
        !savePromptOpen &&
        requiredMissed.every((f) => fieldCurrentValue(f)),
      {
        timeout: 180000,
        message: "Answer the remaining questions. I’ll submit when you’re done.",
      },
    );
    await sleep(1200);
  }

  function fileFieldKind(el) {
    const self = `${el.id || ""} ${el.getAttribute("name") || ""} ${el.getAttribute("aria-label") || ""} ${el.getAttribute("data-automation-id") || ""} ${labelOf(el)}`.toLowerCase();
    if (/cover\s*letter|coverletter|covering.?letter|motivation.?letter/.test(self)) return "cover";
    if (/resume|curriculum|\bcv\b|resume\/cv/.test(self)) return "resume";
    let node = el.parentElement;
    for (let i = 0; i < 5 && node && node !== document.body; i += 1) {
      const heading = node.querySelector?.(":scope > label, :scope > legend, :scope > h2, :scope > h3, :scope > h4")?.innerText || "";
      const hint = `${node.getAttribute?.("data-automation-id") || ""} ${node.getAttribute?.("aria-label") || ""} ${heading}`.toLowerCase();
      if (/cover\s*letter|coverletter|covering.?letter/.test(hint) && !/resume|curriculum|\bcv\b/.test(hint)) return "cover";
      if (/resume|curriculum|\bcv\b|resume\/cv/.test(hint) && !/cover/.test(hint)) return "resume";
      node = node.parentElement;
    }
    return "unknown";
  }

  function resumeFileInputs() {
    const inputs = queryDeep("input[type='file']").filter((el) => !el.disabled);
    const resume = inputs.filter((el) => fileFieldKind(el) === "resume");
    if (resume.length) return resume;
    const unknown = inputs.filter((el) => fileFieldKind(el) !== "cover");
    return unknown.slice(0, 1);
  }

  async function focusResumeSection() {
    const tabs = queryDeep("button, a, [role='tab']");
    const resumeTab = tabs.find((el) => {
      if (!visible(el)) return false;
      const text = controlText(el).replace(/\s+/g, " ").trim();
      if (text.length > 28) return false;
      if (/cover|letter|autofill|auto-fill/i.test(text)) return false;
      return /^(resume|resume\/cv|cv)$/i.test(text) || /^resume\/cv$/i.test(text);
    });
    if (resumeTab) {
      realClick(resumeTab);
      await sleep(400);
    }
  }

  function easyApplyModal() {
    return (
      document.querySelector(".jobs-easy-apply-modal, .jobs-easy-apply-content, [role='dialog'].artdeco-modal, .artdeco-modal") ||
      null
    );
  }

  function easyApplyModalText() {
    return easyApplyModal()?.innerText || "";
  }

  function isSkipOptionalPage() {
    const text = easyApplyModalText();
    return /mark (this|the) job as a top choice|top choice \(optional\)/i.test(text);
  }

  function resumeNameKey(name) {
    return String(name || "")
      .toLowerCase()
      .replace(/\.(pdf|docx|doc)$/g, "")
      .replace(/[^a-z0-9]+/g, "");
  }

  function selectListedResume(fileName) {
    const want = resumeNameKey(fileName);
    if (!want) return false;
    const radios = queryDeep(
      ".jobs-easy-apply-modal input[type='radio'], [role='dialog'] input[type='radio']",
    );
    for (const radio of radios) {
      if (!visible(radio) && radio.type === "radio") {
        /* still try label text */
      }
      const box = radio.closest("label, li, div") || radio.parentElement;
      const label = (box?.innerText || "").replace(/\s+/g, " ");
      const key = resumeNameKey(label);
      if (key && (key.includes(want) || want.includes(key.slice(0, Math.min(key.length, want.length))))) {
        radio.click();
        log(`Selected saved LinkedIn resume matching ${fileName}.`);
        return true;
      }
    }
    return false;
  }

  async function attachResume(profileId, resumeKind) {
    await focusResumeSection();
    const file = await chrome.runtime.sendMessage({
      type: "GET_RESUME",
      profileId,
      resumeKind: resumeKind || "original",
    });
    if (!file?.base64) {
      log(file?.error || "No resume on this profile. Upload it on the JobLink dashboard.");
      return false;
    }
    if (selectListedResume(file.name)) return true;

    let fileInputs = resumeFileInputs();
    if (!fileInputs.length) {
      const uploadBtn = queryDeep("button, label, [role='button']").find((el) => {
        if (!visible(el)) return false;
        const text = controlText(el);
        return /upload resume|upload cv/i.test(text) && !/tailor/i.test(text) && text.length < 40;
      });
      if (uploadBtn) {
        const input = uploadBtn.querySelector?.("input[type='file']") || uploadBtn;
        if (input?.tagName === "INPUT") fileInputs = [input];
      }
      fileInputs = fileInputs.length ? fileInputs : queryDeep(".jobs-easy-apply-modal input[type='file'], [role='dialog'] input[type='file']");
    }
    if (!fileInputs.length) return false;
    const binary = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0));
    const blob = new File([binary], file.name || "resume.pdf", { type: file.contentType || "application/pdf" });
    let attached = 0;
    for (const input of fileInputs) {
      if (fileFieldKind(input) === "cover") continue;
      const dt = new DataTransfer();
      dt.items.add(blob);
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      input.dispatchEvent(new Event("input", { bubbles: true }));
      attached += 1;
    }
    if (attached) log(`Attached ${file.name} from your JobLink profile.`);
    return attached > 0;
  }

  function confirmation() {
    if (!didClickSubmit) return false;
    const dialogText = queryDeep('[role="dialog"], [aria-modal="true"], .artdeco-modal').map((el) => el.innerText || "").join("\n");
    if (/did you apply|have you applied/i.test(dialogText) && !/application submitted|thanks for applying|thank you for applying/i.test(dialogText)) {
      return false;
    }
    const text = `${location.href}\n${document.title}\n${dialogText}\n${(document.querySelector("h1, h2, [data-automation-id='successMessage']")?.innerText || "")}\n${(document.body?.innerText || "").slice(0, 4000)}`;
    return /congratulations|you applied successfully|successfully applied|application (has been )?received|we (have )?received your application|thanks for applying|thank you for applying|application submitted|successfully submitted|you.?re all set|application was sent|your application is complete|application complete/i.test(
      text,
    );
  }

  async function waitForSuccess(timeout = 120000) {
    log("Waiting for a success message…");
    const start = Date.now();
    while (Date.now() - start < timeout) {
      await waitIfHumanCheck(true);
      if (document.readyState !== "complete") await waitForDocumentComplete(8000);
      if (confirmation()) return true;
      await sleep(POLL_MS);
    }
    return confirmation();
  }

  async function finishSuccess(created, meta, listingUrl) {
    log("Application received. Returning to the job listing…");
    await chrome.runtime.sendMessage({
      type: "LOG_APP",
      id: created?.id,
      status: "submitted",
      confirmationUrl: location.href,
      title: meta.title,
      company: meta.company,
    });
    await sleep(2500);
    await chrome.runtime.sendMessage({
      type: "APPLY_SUCCESS",
      listingUrl,
      applyUrl: location.href,
      referrer: document.referrer || "",
      closeTab: true,
    });
  }

  function navControlText(el) {
    return `${el.innerText || ""} ${el.value || ""} ${el.getAttribute("aria-label") || ""} ${el.getAttribute("data-automation-id") || ""}`
      .replace(/\s+/g, " ")
      .trim();
  }

  function navCandidates() {
    return queryDeep(
      "button, a, [role='button'], input[type='button'], input[type='submit'], [data-automation-id='bottom-navigation-next-button']",
    ).filter((el) => {
      if (!visible(el) || el.disabled || el.getAttribute("aria-disabled") === "true") return false;
      const text = navControlText(el);
      return text && !/save for later|cancel|back|previous|decline|autofill/i.test(text);
    });
  }

  function inApplyChrome(el) {
    if (!el) return false;
    return Boolean(
      el.closest(
        "form, [role='dialog'], [aria-modal='true'], .jobs-easy-apply-modal, .artdeco-modal, [data-automation-id='applyFlow'], [data-automation-id='applyFlowPage'], footer, .application, #application, #application_form",
      ),
    );
  }

  function applyNavButtons() {
    const all = navCandidates();
    const scoped = all.filter(inApplyChrome);
    return scoped.length ? scoped : all;
  }

  function findReviewButton() {
    return applyNavButtons().find((el) => /^(review|review application)$/i.test(navControlText(el))) || null;
  }

  function findNextButton() {
    const specific = queryDeep(
      "[data-automation-id='bottom-navigation-next-button'], [data-automation-id='nextButton'], [data-automation-id='continueButton']",
    ).find((el) => visible(el) && !el.disabled);
    if (specific) {
      const text = navControlText(specific);
      if (!/submit/i.test(text)) return specific;
    }
    const buttons = applyNavButtons().map((el) => ({ el, text: navControlText(el) }));
    const exact = buttons.find(({ text }) =>
      /^(next|next page|next step|continue|save and continue|save & continue|review)$/i.test(text),
    );
    if (exact) return exact.el;
    return (
      buttons.find(({ text }) => text.length < 40 && /next page|next step/i.test(text))?.el ||
      buttons.find(({ text }) => text.length < 24 && /^next\b/i.test(text))?.el ||
      null
    );
  }

  function findSubmitButton() {
    const specific = queryDeep(
      "[data-automation-id='submitButton'], input[type='submit']",
    ).find((el) => visible(el) && !el.disabled);
    const buttons = applyNavButtons().map((el) => ({ el, text: navControlText(el) }));
    const patterns = [
      /submit application/i,
      /send application/i,
      /submit my application/i,
      /finish application/i,
      /complete application/i,
      /^submit$/i,
    ];
    for (const rx of patterns) {
      const hit = buttons.find(({ text, el }) => rx.test(text) && text.length < 60 && !/don't|do not/i.test(text) && !el.disabled);
      if (hit) return hit.el;
    }
    return specific || null;
  }

  function requiredStillEmpty(fields) {
    return (fields || inspectFields().filter((f) => f.type !== "file")).filter(
      (f) => f.required && !fieldCurrentValue(f),
    );
  }

  function clickNextOrSubmit(autoSubmit, fields) {
    const missing = requiredStillEmpty(fields);
    if (missing.length) {
      log(`Not submitting yet — ${missing.length} required question(s) still empty.`);
      return null;
    }
    const submit = findSubmitButton();
    const review = findReviewButton();
    const next = findNextButton();
    const submitText = submit ? navControlText(submit) : "";
    const isFinalSubmit = submit && /submit application|send application|submit my application|finish application|complete application|^submit$/i.test(submitText);
    if (autoSubmit && isFinalSubmit) {
      didClickSubmit = true;
      realClick(submit);
      return "submit";
    }
    if (review) {
      realClick(review);
      return "review";
    }
    if (next) {
      realClick(next);
      return "next";
    }
    if (autoSubmit && submit) {
      didClickSubmit = true;
      realClick(submit);
      return "submit";
    }
    return null;
  }

  async function runApply(opts) {
    running = true;
    didClickSubmit = false;
    overlay();
    chrome.runtime
      .sendMessage({
        type: "SET_LISTING",
        referrer: document.referrer || "",
        listingUrl: opts.listingUrl || "",
      })
      .catch(() => undefined);
    if (formReady()) {
      log("Page is ready — first name and required boxes are on screen.");
    } else {
      log("Checking every 2–3 seconds for Apply or for the application form…");
      await waitUntil(() => formReady() || findApplyButton() || confirmation(), {
        timeout: 90000,
        message: "Still looking for Apply or for name fields…",
      });
    }
    const meta = pageMeta();
    const created = await chrome.runtime.sendMessage({
      type: "LOG_APP",
      profileId: opts.profileId,
      jobUrl: opts.jobUrl || location.href,
      title: meta.title,
      company: meta.company,
      ats: isWorkday() ? "workday" : isLinkedIn() ? "linkedin" : "generic",
      status: "applying",
    });

    try {
      if (confirmation()) {
        await finishSuccess(created, meta, opts.listingUrl || opts.jobUrl);
        running = false;
        return;
      }
      if (!formReady()) {
        const started = await startOnListing(opts);
        if (!started && !formReady() && !confirmation()) {
          running = false;
          return;
        }
      } else {
        log("Skipping Apply click — the form is already open.");
        await dismissCookies();
      }
      if (!formReady() && !confirmation()) {
        log("Waiting for full name or other required boxes…");
        const appeared = await waitUntil(() => formReady() || confirmation(), {
          timeout: 90000,
          message: "Waiting for full name or other required boxes…",
        });
        if (!appeared) {
          log("Could not find fields to fill on this page.");
          running = false;
          return;
        }
      }
      if (opts.useResume !== false) await attachResume(opts.profileId, opts.resumeKind);

      for (let step = 0; step < 20; step += 1) {
        await waitUntil(() => formReady() || confirmation() || inspectFields().length > 0, {
          timeout: 45000,
          message: "Waiting for this step’s fields…",
        });
        if (confirmation()) {
          await finishSuccess(created, meta, opts.listingUrl || opts.jobUrl);
          running = false;
          return;
        }
        if (isSkipOptionalPage()) {
          log("Skipping optional top-choice page.");
          const next = findNextButton();
          if (next) {
            realClick(next);
            await sleep(POLL_MS);
            continue;
          }
        }
        const fields = inspectFields().filter(
          (f) => f.type !== "file" && !/top choice/i.test(f.label || "") && !/^field_\d+$/i.test(f.label || ""),
        );
        if (fields.length) {
          log(`Step ${step + 1}: ${fields.length} fields. Filling from your profile, saved answers, and OpenAI…`);
          const mapped = await chrome.runtime.sendMessage({
            type: "API_MAP",
            profileId: opts.profileId,
            jobTitle: meta.title,
            company: meta.company,
            fields,
          });
          if (mapped?.error) log(mapped.error);
          const openaiNote = (mapped?.answers || []).find((a) => a.note && !a.value)?.note;
          if (openaiNote) log(openaiNote);
          fillingNow = true;
          const filledIds = [];
          for (const answer of mapped?.answers || []) {
            if (!answer.value) {
              if (answer.label) log(`No answer for: ${String(answer.label).slice(0, 80)}`);
              continue;
            }
            const ok = await fillOne(answer);
            if (ok) filledIds.push(answer.id);
            if (ok && (answer.source === "saved" || answer.source === "generated")) {
              log(`Filled: ${String(answer.label).slice(0, 80)}`);
            }
            await sleep(80);
          }
          fillingNow = false;
          const autoFilled = {};
          for (const answer of mapped?.answers || []) {
            if (answer.id && filledIds.includes(answer.id) && answer.value) {
              autoFilled[answer.id] = answer.value;
            }
          }
          const skipped = fields.filter((f) => !fieldCurrentValue(f)).map((f) => f.id);
          await chrome.runtime.sendMessage({
            type: "LOG_APP",
            id: created?.id,
            questions: fields.map((f) => ({
              label: f.label,
              type: f.type,
              required: f.required,
              value: fieldCurrentValue(f),
            })),
          });
          if (typeof stopMissedWatch === "function") stopMissedWatch();
          stopMissedWatch = watchManualAnswers(fields, autoFilled, opts.profileId);
          if (skipped.length) {
            log(`${skipped.length} question(s) have no saved answer — fill them, then click Save.`);
            await waitUntilPageFilled(fields, skipped);
          } else {
            log("Finished filling this page from your profile and saved answers.");
            await sleep(1200);
          }
        } else {
          log(`Step ${step + 1}: no fillable boxes yet. Checking again in 2–3 seconds…`);
        }
        if (opts.useResume !== false) await attachResume(opts.profileId, opts.resumeKind);
        const pageFields = fields.length ? fields : inspectFields().filter((f) => f.type !== "file");
        const missingRequired = requiredStillEmpty(pageFields);
        if (missingRequired.length) {
          log(`Waiting for ${missingRequired.length} required answer(s) before Submit…`);
          if (typeof stopMissedWatch !== "function") {
            stopMissedWatch = watchManualAnswers(pageFields, {}, opts.profileId);
          }
          await waitUntilPageFilled(pageFields, missingRequired.map((f) => f.id));
        }
        const submitBtn = findSubmitButton();
        if (submitBtn && opts.autoSubmit !== false) await waitIfHumanCheck(true);
        const action = clickNextOrSubmit(opts.autoSubmit !== false, pageFields);
        if (action === "submit") {
          log("Required answers are filled — clicking Submit / Submit application.");
          const ok = await waitForSuccess(120000);
          if (ok) {
            await finishSuccess(created, meta, opts.listingUrl || opts.jobUrl);
            running = false;
            return;
          }
          log("No success message yet. Complete the human check if it is still on screen.");
          await sleep(POLL_MS);
          continue;
        }
        if (action === "review") {
          log("Clicked Review.");
          await sleep(POLL_MS);
          continue;
        }
        if (action === "next") {
          log("Clicked Next.");
          await sleep(POLL_MS);
          continue;
        }
        await sleep(POLL_MS);
      }
      log("Stopped after checking the page. Sign in or finish the human check if it is stuck.");
    } catch (error) {
      log(error instanceof Error ? error.message : "Apply failed");
      await chrome.runtime.sendMessage({
        type: "LOG_APP",
        id: created?.id,
        status: "failed",
        error: error instanceof Error ? error.message : "Apply failed",
      });
    }
    running = false;
  }
})();

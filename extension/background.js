const DEFAULT_API = "http://localhost:3001";

async function settings() {
  const stored = await chrome.storage.local.get(["apiBase"]);
  return { apiBase: (stored.apiBase || DEFAULT_API).replace(/\/$/, "") };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "START_APPLY") {
    startApply(message).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message.type === "API_MAP") {
    mapFields(message).then(sendResponse).catch((error) => sendResponse({ error: error.message }));
    return true;
  }
  if (message.type === "GET_RESUME") {
    getResume(message.profileId, message.resumeKind).then(sendResponse).catch((error) => sendResponse({ error: error.message }));
    return true;
  }
  if (message.type === "LOG_APP") {
    logApp(message).then(sendResponse).catch((error) => sendResponse({ error: error.message }));
    return true;
  }
  if (message.type === "APPLY_SUCCESS") {
    returnToListing(sender.tab, message).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message.type === "SAVE_ANSWER") {
    saveAnswer(message).then(sendResponse).catch((error) => sendResponse({ error: error.message }));
    return true;
  }
  if (message.type === "SET_LISTING") {
    chrome.storage.session.get("applyJob").then(({ applyJob }) => {
      if (!applyJob) return sendResponse({ ok: false });
      return chrome.storage.session
        .set({
          applyJob: {
            ...applyJob,
            referrer: message.referrer || applyJob.referrer,
            listingUrl: applyJob.listingUrl || message.listingUrl,
          },
        })
        .then(() => sendResponse({ ok: true }));
    });
    return true;
  }
  if (message.type === "ROBOT_FRAME") {
    chrome.storage.session
      .get("applyJob")
      .then(({ applyJob }) => {
        if (!applyJob) return;
        return chrome.storage.session.set({
          robotFrame: { present: Boolean(message.present), solved: Boolean(message.solved), at: Date.now() },
        });
      })
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
});

async function startApply(message) {
  const tab = await chrome.tabs.get(message.tabId).catch(() => null);
  const url = tab?.url || message.jobUrl || "";
  const payload = {
    ...message,
    startedAt: Date.now(),
    openerTabId: message.tabId,
    listingTabId: message.tabId,
    applyTabId: message.tabId,
    listingUrl: message.listingUrl || message.jobUrl || url,
    jobUrl: message.jobUrl || url,
  };
  await chrome.storage.session.remove("pendingConfirm");
  await chrome.storage.session.set({ applyJob: payload });
  await chrome.tabs.sendMessage(message.tabId, { type: "START_APPLY", ...payload }).catch(async () => {
    await chrome.scripting.executeScript({
      target: { tabId: message.tabId, allFrames: true },
      files: ["content.js"],
    });
    await chrome.tabs.sendMessage(message.tabId, { type: "START_APPLY", ...payload });
  });
}

function stripUrl(url) {
  return (url || "").split("?")[0].split("#")[0].replace(/\/$/, "");
}

function isSuccessOrApplyUrl(url) {
  return /thank|success|submitted|confirmation|application.received|\/apply\b|job_application/i.test(url || "");
}

function isAtsApplyUrl(url) {
  return /greenhouse\.io|lever\.co|ashbyhq|myworkdayjobs|workday\.com|smartrecruiters|icims|workable|job-boards\.greenhouse/i.test(
    url || "",
  );
}

async function returnToListing(tab, message) {
  const { applyJob } = await chrome.storage.session.get("applyJob");
  const applyTabId = tab?.id || applyJob?.applyTabId;
  const listingTabId = applyJob?.listingTabId || applyJob?.openerTabId;
  const referrer = message.referrer || applyJob?.referrer || "";
  let listingUrl = applyJob?.listingUrl || message.listingUrl || "";
  const applyUrl = tab?.url || message.applyUrl || "";

  if (referrer && /^https?:\/\//i.test(referrer) && stripUrl(referrer) !== stripUrl(applyUrl)) {
    if (!listingUrl || stripUrl(listingUrl) === stripUrl(applyUrl) || isSuccessOrApplyUrl(listingUrl)) {
      listingUrl = referrer;
    }
  }

  let listingTab = listingTabId ? await chrome.tabs.get(listingTabId).catch(() => null) : null;
  if (listingTab && applyTabId && listingTab.id === applyTabId) {
    listingTab = null;
  }
  if (!listingTab && listingUrl) {
    const tabs = await chrome.tabs.query({}).catch(() => []);
    listingTab =
      tabs.find((row) => row.id !== applyTabId && stripUrl(row.url) === stripUrl(listingUrl)) ||
      tabs.find((row) => row.id !== applyTabId && /linkedin\.com\/jobs/i.test(row.url || "")) ||
      null;
  }

  await chrome.storage.session.remove("applyJob");
  await chrome.storage.session.remove("robotFrame");

  let focusedId = null;
  if (listingTab?.id && listingTab.id !== applyTabId) {
    await chrome.tabs.update(listingTab.id, { active: true }).catch(() => undefined);
    focusedId = listingTab.id;
  } else if (listingUrl && stripUrl(listingUrl) !== stripUrl(applyUrl)) {
    if (applyTabId && listingTabId === applyTabId) {
      await chrome.tabs.update(applyTabId, { url: listingUrl, active: true }).catch(() => undefined);
      focusedId = applyTabId;
    } else {
      const opened = await chrome.tabs.create({ url: listingUrl, active: true }).catch(() => null);
      focusedId = opened?.id || null;
    }
  } else if (applyTabId && listingUrl) {
    await chrome.tabs.goBack(applyTabId).catch(() => undefined);
    await sleep(500);
    const after = await chrome.tabs.get(applyTabId).catch(() => null);
    if (after && isSuccessOrApplyUrl(after.url) && listingUrl && stripUrl(after.url) !== stripUrl(listingUrl)) {
      await chrome.tabs.update(applyTabId, { url: listingUrl, active: true }).catch(() => undefined);
    } else {
      await chrome.tabs.update(applyTabId, { active: true }).catch(() => undefined);
    }
    focusedId = applyTabId;
  }

  await chrome.storage.session.set({
    pendingConfirm: {
      listingTabId: focusedId || listingTab?.id,
      listingUrl,
      until: Date.now() + 30000,
    },
  });

  if (applyTabId && applyTabId !== focusedId) {
    await sleep(200);
    await chrome.tabs.remove(applyTabId).catch(() => undefined);
  }
  if (focusedId) await askListingConfirm(focusedId);
}

async function askListingConfirm(tabId) {
  const ping = async () => {
    await chrome.tabs.sendMessage(tabId, { type: "CONFIRM_APPLIED" }).catch(async () => {
      await chrome.scripting
        .executeScript({ target: { tabId, allFrames: false }, files: ["content.js"] })
        .catch(() => undefined);
      await chrome.tabs.sendMessage(tabId, { type: "CONFIRM_APPLIED" }).catch(() => undefined);
    });
  };
  await sleep(600);
  await ping();
  setTimeout(ping, 2000);
  setTimeout(ping, 5000);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.status !== "complete" || !tab.url) return;
  const session = await chrome.storage.session.get(["applyJob", "pendingConfirm"]);
  if (
    session.pendingConfirm &&
    Date.now() < session.pendingConfirm.until &&
    tabId === session.pendingConfirm.listingTabId
  ) {
    chrome.tabs.sendMessage(tabId, { type: "CONFIRM_APPLIED" }).catch(() => undefined);
    return;
  }
  const { applyJob } = session;
  if (!applyJob || Date.now() - applyJob.startedAt > 8 * 60 * 1000) return;
  const listingBase = stripUrl(applyJob.listingUrl);
  const tabBase = stripUrl(tab.url);
  if (tabId === applyJob.listingTabId && listingBase && tabBase === listingBase && !isAtsApplyUrl(tab.url)) return;
  const isOpener = tabId === applyJob.openerTabId;
  const isAts = isAtsApplyUrl(tab.url);
  if (!isOpener && !isAts) return;
  if (tabId !== applyJob.listingTabId) {
    await chrome.storage.session.set({
      applyJob: { ...applyJob, applyTabId: tabId },
    });
  }
  chrome.tabs
    .sendMessage(tabId, { type: "START_APPLY", ...applyJob, applyTabId: tabId, continued: true })
    .catch(() => undefined);
});

async function mapFields(message) {
  const { apiBase } = await settings();
  const res = await fetch(`${apiBase}/api/extension/map`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      profileId: message.profileId,
      jobTitle: message.jobTitle,
      company: message.company,
      fields: message.fields,
    }),
  });
  return res.json();
}

async function getResume(profileId, resumeKind = "original") {
  const { apiBase } = await settings();
  const kind = resumeKind === "tailored" ? "tailored" : "original";
  const res = await fetch(
    `${apiBase}/api/profiles/${encodeURIComponent(profileId)}/resume?kind=${encodeURIComponent(kind)}`,
  );
  if (!res.ok) return { error: "No resume on this profile." };
  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  const contentType = res.headers.get("Content-Type") || "application/pdf";
  const match = /filename="?([^"]+)/.exec(res.headers.get("Content-Disposition") || "");
  return {
    base64: btoa(binary),
    contentType,
    name: match?.[1] || "resume.pdf",
  };
}

async function saveAnswer(message) {
  const { apiBase } = await settings();
  const res = await fetch(`${apiBase}/api/extension/save-answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      profileId: message.profileId,
      question: message.question,
      answer: message.answer,
    }),
  });
  return res.json();
}

async function logApp(message) {
  const { apiBase } = await settings();
  const res = await fetch(`${apiBase}/api/extension/log`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message),
  });
  return res.json();
}

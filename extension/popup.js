const apiBaseEl = document.getElementById("apiBase");
const profileEl = document.getElementById("profileId");
const resumeKindEl = document.getElementById("resumeKind");
const statusEl = document.getElementById("status");
const applyBtn = document.getElementById("apply");
const autoSubmitEl = document.getElementById("autoSubmit");

async function stored() {
  return chrome.storage.local.get(["apiBase", "profileId", "resumeKind", "autoSubmit"]);
}

async function loadProfiles() {
  const { apiBase = "http://localhost:3001", profileId, resumeKind } = await stored();
  apiBaseEl.value = apiBase;
  if (resumeKind) resumeKindEl.value = resumeKind;
  statusEl.textContent = "Loading profiles…";
  try {
    const res = await fetch(`${apiBase.replace(/\/$/, "")}/api/profiles`);
    if (!res.ok) throw new Error("Could not reach JobLink");
    const data = await res.json();
    profileEl.innerHTML = "";
    for (const row of data.profiles || []) {
      const opt = document.createElement("option");
      opt.value = row.id;
      const resumeNote = row.hasTailoredResume ? " · original + tailored" : row.hasResume ? " · resume saved" : "";
      opt.textContent = `${row.name || `${row.firstName} ${row.lastName}`.trim() || row.email}${resumeNote}`;
      profileEl.appendChild(opt);
    }
    const selected = profileId || data.activeId || data.profiles?.[0]?.id;
    if (selected) profileEl.value = selected;
    statusEl.textContent = profileEl.options.length
      ? "Ready. Click a job on the left, then Easy Apply on this job."
      : "Create a profile on the JobLink website first.";
  } catch {
    statusEl.textContent = "Start the JobLink site on this server URL.";
  }
}

apiBaseEl.addEventListener("change", async () => {
  await chrome.storage.local.set({ apiBase: apiBaseEl.value.trim() });
  await loadProfiles();
});
profileEl.addEventListener("change", () => {
  chrome.storage.local.set({ profileId: profileEl.value });
});
resumeKindEl.addEventListener("change", () => {
  chrome.storage.local.set({ resumeKind: resumeKindEl.value });
});

applyBtn.addEventListener("click", async () => {
  const apiBase = apiBaseEl.value.trim().replace(/\/$/, "");
  const profileId = profileEl.value;
  if (!profileId) {
    statusEl.textContent = "Pick a profile.";
    return;
  }
  await chrome.storage.local.set({
    apiBase,
    profileId,
    resumeKind: resumeKindEl.value,
    useResume: true,
    autoSubmit: autoSubmitEl.checked,
  });
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  if (!/linkedin\.com/i.test(tab.url || "")) {
    statusEl.textContent = "Open a LinkedIn job first.";
    return;
  }
  statusEl.textContent = "Starting Easy Apply on this job…";
  chrome.runtime.sendMessage({
    type: "START_APPLY",
    tabId: tab.id,
    apiBase,
    profileId,
    resumeKind: resumeKindEl.value,
    useResume: true,
    autoSubmit: autoSubmitEl.checked,
    jobUrl: tab.url,
    listingUrl: tab.url,
  });
});

stored().then((data) => {
  if (data.apiBase) apiBaseEl.value = data.apiBase;
  if (data.resumeKind) resumeKindEl.value = data.resumeKind;
  autoSubmitEl.checked = data.autoSubmit !== false;
  loadProfiles();
});

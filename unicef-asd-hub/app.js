import { supabase } from "./config.js";

let currentUser = null;
let currentProfile = null;
let currentBadges = [];
let authMode = "signin";
let allIdeas = [];
let renderedIdeas = [];
let pendingIdeas = [];
let activeCommitteeFilter = "all";
let searchTerm = "";
let allBadges = [];
let reportTarget = null;
let confirmCallback = null;

const COMMITTEES = ["events", "fundraising", "media", "awareness"];
const isMod = () => currentProfile && (currentProfile.role === "president" || currentProfile.role === "moderator");
const isPresident = () => currentProfile && currentProfile.role === "president";

document.addEventListener("DOMContentLoaded", () => {
  setupEventListeners();
  initializeAuth();
});

function setupEventListeners() {
  document.getElementById("auth-form")?.addEventListener("submit", handleAuthSubmit);
  document.getElementById("logout-btn")?.addEventListener("click", handleSignOut);
  document.getElementById("submit-idea-btn")?.addEventListener("click", handleSubmitIdea);
  document.getElementById("github-signin-btn")?.addEventListener("click", handleGitHubSignIn);
  document.getElementById("change-pw-form")?.addEventListener("submit", handleChangePassword);
  document.getElementById("username-form")?.addEventListener("submit", handleUsernameSubmit);
  document.getElementById("event-form")?.addEventListener("submit", handleEventSubmit);
}

async function initializeAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  await updateAuthState(session?.user || null);
  supabase.auth.onAuthStateChange(async (_e, s) => updateAuthState(s?.user || null));
}

async function updateAuthState(user) {
  currentUser = user;
  const portalView = document.getElementById("portal-view");
  const websiteView = document.getElementById("website-view");
  const subnav = document.getElementById("app-subnav");
  const navOut = document.getElementById("nav-logged-out");
  const navIn = document.getElementById("nav-logged-in");

  if (currentUser) {
    await fetchOrCreateUserProfile(currentUser);
    
    portalView?.classList.add("hidden");
    websiteView?.classList.remove("hidden");
    subnav?.classList.remove("hidden");
    navOut?.classList.add("hidden");
    navIn?.classList.remove("hidden");
    
    // Securely check role before showing Mod Panel
    const isActuallyMod = currentProfile && (currentProfile.role === "president" || currentProfile.role === "moderator");
    
    if (isActuallyMod) {
      document.getElementById("tab-btn-moderation")?.classList.remove("hidden");
      await loadModPanel();
    } else {
      document.getElementById("tab-btn-moderation")?.classList.add("hidden");
      // If they were on the mod tab, kick them back to the feed
      document.getElementById("sec-moderation")?.classList.add("hidden");
      document.getElementById("sec-feed")?.classList.remove("hidden");
      switchTab('feed');
    }

    await loadIdeasFeed();
    await loadEvents();
    await loadSpotlight();
    await loadAllBadges();
    await loadUserBadges();
  } else {
    currentProfile = null;
    currentBadges = [];
    portalView?.classList.remove("hidden");
    websiteView?.classList.add("hidden");
    subnav?.classList.add("hidden");
    navOut?.classList.remove("hidden");
    navIn?.classList.add("hidden");
    document.getElementById("username-modal")?.classList.add("hidden");
  }
}
async function fetchOrCreateUserProfile(user) {
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (data && data.username) {
    currentProfile = data;
    document.getElementById("username-modal")?.classList.add("hidden");
  } else {
    currentProfile = data;
    // document.getElementById("username-modal")?.classList.remove("hidden");
  }
  const nav = document.getElementById("nav-username");
  if (nav) nav.innerText = currentProfile?.username ? `@${currentProfile.username}` : "@…";
  document.getElementById("acc-username-display").innerText = currentProfile?.username ? `@${currentProfile.username}` : "—";
  document.getElementById("acc-email-display").innerText = user.email || "—";
  document.getElementById("acc-role-display").innerText = currentProfile?.role || "member";
}

async function loadUserBadges() {
  if (!currentUser) return;
  const { data } = await supabase
    .from("user_badges")
    .select("badges(name,icon)")
    .eq("user_id", currentUser.id);
  currentBadges = (data || []).map(r => r.badges).filter(Boolean);
  const el = document.getElementById("acc-badges-display");
  if (el) el.innerHTML = currentBadges.length ? currentBadges.map(b => `${b.icon} ${b.name}`).join("<br>") : "—";
}

async function loadAllBadges() {
  const { data } = await supabase.from("badges").select("*").order("name");
  allBadges = data || [];
  const sel = document.getElementById("badge-select");
  if (sel) sel.innerHTML = allBadges.map(b => `<option value="${b.id}">${b.icon} ${b.name}</option>`).join("");
}

async function handleGitHubSignIn() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: { redirectTo: window.location.href }
  });
  if (error) alert("GitHub Sign-In Error: " + error.message);
}

window.toggleAuthTab = function (mode) {
  authMode = mode;
  document.getElementById("signup-fields-group").classList.toggle("hidden", mode !== "signup");
  document.getElementById("auth-submit-btn").innerHTML = mode === "signin" ? "<span>Sign In</span>" : "<span>Create Account</span>";
  document.getElementById("auth-tab-signin").className = mode === "signin" ? "pb-3 px-4 font-bold text-sm text-[#00ADEF] border-b-2 border-[#00ADEF]" : "pb-3 px-4 font-bold text-sm text-slate-400 border-b-2 border-transparent";
  document.getElementById("auth-tab-signup").className = mode === "signup" ? "pb-3 px-4 font-bold text-sm text-[#00ADEF] border-b-2 border-[#00ADEF]" : "pb-3 px-4 font-bold text-sm text-slate-400 border-b-2 border-transparent";
};

window.showAuthPortal = () => {
  document.getElementById("portal-view").classList.remove("hidden");
  document.getElementById("website-view").classList.add("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
};

async function handleAuthSubmit(e) {
  e.preventDefault();
  const email = document.getElementById("auth-email").value.trim();
  const password = document.getElementById("auth-password").value.trim();

  if (authMode === "signup") {
    const username = document.getElementById("auth-username").value.trim();
    const fullname = document.getElementById("auth-fullname").value.trim();
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) return alert("Username must be 3-20 chars (letters/numbers/_).");
    if (!isStrongPassword(password)) return alert("Password must be 8+ chars with lowercase, uppercase, and a number.");

    const { data: existing } = await supabase.from("profiles").select("id").eq("username", username).maybeSingle();
    if (existing) return alert("Username already taken.");

    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return alert("Sign Up Error: " + error.message);

    if (data.user) {
      const { error: upErr } = await supabase.from("profiles").upsert({
        id: data.user.id, username, full_name: fullname, auth_provider: "email"
      });
      if (upErr) console.warn("Profile upsert:", upErr.message);
      if (!data.session) alert("Check your email to confirm, then sign in.");
    }
  } else {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert("Sign In Error: " + error.message);
  }
}

function isStrongPassword(pw) {
  return pw.length >= 8 && /[a-z]/.test(pw) && /[A-Z]/.test(pw) && /[0-9]/.test(pw);
}

async function handleSignOut() {
  await supabase.auth.signOut();
  location.reload();
}

async function handleUsernameSubmit(e) {
  e.preventDefault();
  if (!currentUser) return;
  
  // Automatically strip the @ if the user typed it
  let username = document.getElementById("onboard-username").value.trim();
  if (username.startsWith("@")) {
    username = username.substring(1);
  }
  
  const fullname = document.getElementById("onboard-fullname").value.trim();
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) return alert("Username must be 3-20 chars (letters/numbers/_).");

  const { data: existing } = await supabase.from("profiles").select("id").eq("username", username).maybeSingle();
  if (existing && existing.id !== currentUser.id) return alert("Username already taken.");

  const provider = currentUser.app_metadata?.provider || "email";
  const { error } = await supabase.from("profiles").upsert({
    id: currentUser.id, username, full_name: fullname, auth_provider: provider
  });
  if (error) return alert("Error: " + error.message);
  
  // Hide the modal explicitly after saving
  document.getElementById("username-modal")?.classList.add("hidden");
  await fetchOrCreateUserProfile(currentUser);
}

async function handleChangePassword(e) {
  e.preventDefault();
  const pw = document.getElementById("new-password").value.trim();
  const confirm = document.getElementById("confirm-password").value.trim();
  if (pw !== confirm) return alert("Passwords do not match.");
  if (!isStrongPassword(pw)) return alert("Password must be 8+ chars with lowercase, uppercase, and a number.");
  const { error } = await supabase.auth.updateUser({ password: pw });
  if (error) return alert("Error: " + error.message);
  alert("Password updated!");
  e.target.reset();
}

async function handleSubmitIdea() {
  if (!currentUser) return alert("Please sign in.");
  const title = document.getElementById("prop-title").value.trim();
  const committee = document.getElementById("prop-committee").value;
  const description = document.getElementById("prop-description").value.trim();
  const fileInput = document.getElementById("prop-file");
  const file = fileInput?.files[0];

  if (!title || !description) return alert("Fill title & description.");
  if (!COMMITTEES.includes(committee)) return alert("Invalid committee.");

  let attachmentPath = null;
  if (file) {
    const MAX = 5 * 1024 * 1024;
    const ALLOWED = ["image/jpeg","image/png","image/gif","image/webp","application/pdf","text/plain"];
    if (file.size > MAX) return alert("Max 5MB.");
    if (!ALLOWED.includes(file.type)) return alert("Allowed: image, PDF, txt.");
    const ext = file.name.split(".").pop();
    const path = `${currentUser.id}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("idea-attachments").upload(path, file);
    if (upErr) return alert("Upload error: " + upErr.message);
    attachmentPath = path;
  }

  const { error } = await supabase.from("ideas").insert([{
    user_id: currentUser.id, title, committee, description, attachment_url: attachmentPath, status: "pending"
  }]);
  if (error) return alert("Error: " + error.message);

  alert("Submitted for executive review!");
  document.getElementById("prop-title").value = "";
  document.getElementById("prop-description").value = "";
  if (fileInput) fileInput.value = "";
  closeProposalModal();
  await loadIdeasFeed();
}

async function loadIdeasFeed() {
  const feedEl = document.getElementById("ideas-feed-container");
  if (!feedEl) return;

  const { data, error } = await supabase
    .from("ideas")
    .select("*, profiles!ideas_user_id_fkey(username)")
    .order("created_at", { ascending: false });

  if (error) {
    feedEl.innerHTML = `<p class="text-red-500 font-semibold col-span-full">Error: ${escapeHtml(error.message)}</p>`;
    return;
  }

  allIdeas = data || [];
  const approved = allIdeas.filter(i => i.status === "approved");
  const pending = allIdeas.filter(i => i.status === "pending");
  document.getElementById("stat-approved-count").innerText = approved.length;
  document.getElementById("stat-pending-count").innerText = pending.length;

  renderedIdeas = await Promise.all(approved.map(async (item) => {
    let signedUrl = null;
    if (item.attachment_url) {
      const { data: s } = await supabase.storage.from("idea-attachments").createSignedUrl(item.attachment_url, 3600);
      signedUrl = s?.signedUrl || null;
    }
    return { ...item, signedUrl };
  }));

  applyFilters();
}

function applyFilters() {
  let filtered = renderedIdeas;
  if (activeCommitteeFilter !== "all") filtered = filtered.filter(i => i.committee === activeCommitteeFilter);
  if (searchTerm) {
    const q = searchTerm.toLowerCase();
    filtered = filtered.filter(i =>
      (i.title || "").toLowerCase().includes(q) ||
      (i.description || "").toLowerCase().includes(q) ||
      (i.profiles?.username || "").toLowerCase().includes(q)
    );
  }
  renderFeed(filtered);
}

function renderFeed(items) {
  const feedEl = document.getElementById("ideas-feed-container");
  if (!feedEl) return;
  if (items.length === 0) {
    feedEl.innerHTML = `<p class="text-slate-400 font-medium col-span-full text-center py-8">No approved proposals yet.</p>`;
    return;
  }
  feedEl.innerHTML = items.map(item => `
    <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between space-y-4">
      <div>
        <div class="flex items-center justify-between mb-2">
          <span class="px-2.5 py-1 rounded-md text-xs font-bold bg-blue-100 text-[#008CC3] uppercase">${escapeHtml(item.committee)}</span>
          <span class="text-xs text-slate-400">${new Date(item.created_at).toLocaleDateString()}</span>
        </div>
        <h4 class="text-base font-bold text-slate-800 mb-1">${escapeHtml(item.title)}</h4>
        <p class="text-xs text-slate-600 leading-relaxed mb-3">${escapeHtml(item.description)}</p>
        ${item.signedUrl ? `
          <div class="mt-2 p-2 bg-slate-50 border rounded-lg flex items-center justify-between text-xs">
            <span class="font-medium">📎 Attachment</span>
            <a href="${item.signedUrl}" target="_blank" class="text-[#00ADEF] font-bold">View</a>
          </div>` : ""}
      </div>
      <div class="pt-3 border-t border-slate-100 text-xs flex justify-between items-center">
        <span class="font-semibold text-slate-500">By @${escapeHtml(item.profiles?.username || "student")}</span>
        <button onclick="openReport('idea','${item.id}')" class="text-red-400 hover:text-red-600"><i class="fa-solid fa-flag"></i></button>
      </div>
    </div>
  `).join("");
}

window.filterCommittees = function (committee) {
  activeCommitteeFilter = committee;
  document.querySelectorAll(".filter-btn").forEach(btn => {
    btn.className = "filter-btn px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-600";
  });
  const active = document.getElementById(`btn-filter-${committee}`);
  if (active) active.className = "filter-btn px-3 py-1.5 rounded-lg text-xs font-bold bg-[#00ADEF] text-white";
  applyFilters();
};

window.searchProposals = function () {
  searchTerm = document.getElementById("feed-search-input")?.value || "";
  applyFilters();
};

async function loadEvents() {
  const grid = document.getElementById("events-grid");
  if (!grid) return;
  const { data, error } = await supabase.from("events").select("*").order("event_date", { ascending: true });
  if (error) { grid.innerHTML = `<p class="text-red-500">Error: ${escapeHtml(error.message)}</p>`; return; }

  const now = new Date();
  const upcoming = (data || []).filter(e => new Date(e.event_date) >= now);
  const past = (data || []).filter(e => new Date(e.event_date) < now);
  document.getElementById("stat-events-count").innerText = upcoming.length;

  const card = (e) => `
    <div class="border rounded-xl p-4 bg-slate-50">
      <div class="flex justify-between mb-2">
        <span class="text-xs font-bold uppercase text-[#008CC3]">${escapeHtml(e.committee)}</span>
        <span class="text-xs text-slate-500">${new Date(e.event_date).toLocaleDateString()}</span>
      </div>
      <h4 class="font-bold mb-1">${escapeHtml(e.title)}</h4>
      <p class="text-xs text-slate-600 mb-2">${escapeHtml(e.description)}</p>
      <p class="text-xs text-slate-500"><i class="fa-solid fa-location-dot mr-1"></i>${escapeHtml(e.location)}</p>
    </div>`;

  grid.innerHTML = `
    <div class="col-span-full">
      <h4 class="font-bold text-slate-700 mb-2">Upcoming</h4>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        ${upcoming.length ? upcoming.map(card).join("") : `<p class="text-sm text-slate-400">No upcoming events.</p>`}
      </div>
    </div>
    <div class="col-span-full mt-6">
      <h4 class="font-bold text-slate-700 mb-2">Past</h4>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        ${past.length ? past.map(card).join("") : `<p class="text-sm text-slate-400">No past events.</p>`}
      </div>
    </div>`;
}

async function handleEventSubmit(e) {
  e.preventDefault();
  if (!currentUser) return alert("Please sign in.");
  const title = document.getElementById("evt-title").value.trim();
  const date = document.getElementById("evt-date").value;
  const location = document.getElementById("evt-location").value.trim();
  const committee = document.getElementById("evt-committee").value;
  const description = document.getElementById("evt-description").value.trim();
  if (!title || !date || !location || !description) return alert("Fill all fields.");

  const { error } = await supabase.from("events").insert([{
    created_by: currentUser.id, title, description,
    event_date: new Date(date).toISOString(), location, committee
  }]);
  if (error) return alert("Error: " + error.message);
  alert("Event published!");
  closeEventModal();
  e.target.reset();
  await loadEvents();
}

async function loadSpotlight() {
  try {
    const { data } = await supabase.from("monthly_issues").select("*").eq("is_active", true).limit(1).maybeSingle();
    if (data) {
      document.getElementById("spotlight-title").innerText = data.title;
      document.getElementById("spotlight-description").innerText = data.description;
      if (data.image_url) document.getElementById("spotlight-image").src = data.image_url;
    }
  } catch (_) {}
}

async function loadModPanel() {
  if (!isMod()) return;

  const { data: pend } = await supabase
    .from("ideas")
    .select("*, profiles!ideas_user_id_fkey(username)")
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  pendingIdeas = pend || [];

  const cont = document.getElementById("pending-ideas-container");
  if (cont) cont.innerHTML = pendingIdeas.length ? pendingIdeas.map(p => `
    <div class="border rounded-lg p-3 bg-amber-50">
      <div class="flex justify-between items-start">
        <div>
          <h5 class="font-bold text-sm">${escapeHtml(p.title)} <span class="text-xs bg-blue-100 text-[#008CC3] px-2 py-0.5 rounded uppercase">${p.committee}</span></h5>
          <p class="text-xs text-slate-600 mt-1">${escapeHtml(p.description)}</p>
          <p class="text-[10px] text-slate-400 mt-1">by @${escapeHtml(p.profiles?.username || "?")}</p>
        </div>
        <div class="flex space-x-2 ml-2">
          <button onclick="approveIdea('${p.id}')" class="px-3 py-1 bg-emerald-600 text-white text-xs font-bold rounded touch-btn">✓</button>
          <button onclick="rejectIdea('${p.id}')" class="px-3 py-1 bg-red-600 text-white text-xs font-bold rounded touch-btn">✗</button>
        </div>
      </div>
    </div>
  `).join("") : `<p class="text-xs text-slate-400">No pending proposals.</p>`;

  const { data: reps } = await supabase
    .from("reports")
    .select("*, profiles!reports_reporter_id_fkey(username)")
    .eq("status", "open")
    .order("created_at", { ascending: false });

  const rc = document.getElementById("reports-container");
  if (rc) rc.innerHTML = (reps || []).length ? reps.map(r => `
    <div class="border rounded-lg p-3 bg-red-50">
      <div class="flex justify-between items-start">
        <div>
          <h5 class="font-bold text-sm">${escapeHtml(r.reason)} — ${r.target_type}</h5>
          <p class="text-xs text-slate-600">${escapeHtml(r.details || "")}</p>
          <p class="text-[10px] text-slate-400">by @${escapeHtml(r.profiles?.username || "?")}</p>
        </div>
        <div class="flex space-x-2">
          <button onclick="resolveReport('${r.id}','dismissed')" class="px-3 py-1 bg-slate-500 text-white text-xs font-bold rounded touch-btn">Dismiss</button>
          <button onclick="resolveReport('${r.id}','resolved')" class="px-3 py-1 bg-emerald-600 text-white text-xs font-bold rounded touch-btn">Resolve</button>
        </div>
      </div>
    </div>
  `).join("") : `<p class="text-xs text-slate-400">No open reports.</p>`;
}

window.approveIdea = async (id) => {
  const { error } = await supabase.from("ideas").update({ status: "approved", reviewed_by: currentUser.id }).eq("id", id);
  if (error) return alert("Error: " + error.message);
  await loadIdeasFeed();
  await loadModPanel();
};

window.rejectIdea = (id) => {
  showConfirm("Reject Submission?", "Are you sure you want to reject this submission?", async () => {
    const { error } = await supabase.from("ideas").update({ status: "rejected", reviewed_by: currentUser.id }).eq("id", id);
    if (error) return alert("Error: " + error.message);
    await loadIdeasFeed();
    await loadModPanel();
  });
};

window.resolveReport = async (id, status) => {
  const { error } = await supabase.from("reports").update({ status, resolved_by: currentUser.id }).eq("id", id);
  if (error) return alert("Error: " + error.message);
  await loadModPanel();
};

window.assignBadge = async () => {
  const uname = document.getElementById("badge-user-username").value.trim().replace(/^@/, "");
  const badgeId = document.getElementById("badge-select").value;
  if (!uname || !badgeId) return alert("Fill username & badge.");

  const { data: profile } = await supabase.from("profiles").select("id").eq("username", uname).maybeSingle();
  if (!profile) return alert("User not found.");

  const { error } = await supabase.from("user_badges").upsert({
    user_id: profile.id, badge_id: badgeId, assigned_by: currentUser.id
  });
  if (error) return alert("Error: " + error.message);
  alert("Badge assigned!");
};

window.updateUserRole = async () => {
  const uname = document.getElementById("role-username").value.trim().replace(/^@/, "");
  const role = document.getElementById("role-select").value;
  if (!uname) return alert("Enter username.");
  if (role === "president" && !isPresident()) return alert("Only the President can promote to President.");

  const { data: profile } = await supabase.from("profiles").select("id").eq("username", uname).maybeSingle();
  if (!profile) return alert("User not found.");

  const { error } = await supabase.from("profiles").update({ role }).eq("id", profile.id);
  if (error) return alert("Error: " + error.message);
  alert("Role updated!");
};

window.openReport = (type, id) => {
  reportTarget = { type, id };
  document.getElementById("report-modal").classList.remove("hidden");
};
window.closeReportModal = () => document.getElementById("report-modal").classList.add("hidden");

window.submitReport = async () => {
  if (!reportTarget || !currentUser) return;
  const reason = document.getElementById("report-reason").value;
  const details = document.getElementById("report-details").value.trim();
  const { error } = await supabase.from("reports").insert([{
    reporter_id: currentUser.id, target_type: reportTarget.type,
    target_id: reportTarget.id, reason, details
  }]);
  if (error) return alert("Error: " + error.message);
  alert("Report submitted.");
  closeReportModal();
};

function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));
}

window.openProposalModal = () => document.getElementById("proposal-modal").classList.remove("hidden");
window.closeProposalModal = () => document.getElementById("proposal-modal").classList.add("hidden");
window.openEventModal = () => document.getElementById("event-modal").classList.remove("hidden");
window.closeEventModal = () => document.getElementById("event-modal").classList.add("hidden");
window.navigateToHome = () => window.scrollTo({ top: 0, behavior: "smooth" });

window.showConfirm = (title, message, cb) => {
  document.getElementById("confirm-title").innerText = title;
  document.getElementById("confirm-message").innerText = message;
  confirmCallback = cb;
  document.getElementById("confirm-modal").classList.remove("hidden");
};
window.closeConfirm = () => {
  document.getElementById("confirm-modal").classList.add("hidden");
  confirmCallback = null;
};
document.addEventListener("click", (e) => {
  if (e.target.id === "confirm-ok-btn" && confirmCallback) {
    const cb = confirmCallback;
    closeConfirm();
    cb();
  }
});

window.switchTab = function (tabName) {
  ["feed","events","spotlight","moderation","account"].forEach(t => {
    const sec = document.getElementById(`sec-${t}`);
    const btn = document.getElementById(`tab-btn-${t}`);
    if (sec) sec.classList.toggle("hidden", t !== tabName);
    if (btn) {
      btn.className = t === tabName
        ? "nav-tab-btn px-3 py-2 text-sm font-semibold text-[#00ADEF] border-b-2 border-[#00ADEF] whitespace-nowrap"
        : "nav-tab-btn px-3 py-2 text-sm font-semibold text-slate-600 border-b-2 border-transparent whitespace-nowrap";
    }
  });
};
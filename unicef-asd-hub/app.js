import { supabase } from "./config.js";

let currentUser = null;
let currentProfile = null;
let authMode = "signin";
let allIdeas = [];
let renderedIdeas = [];
let activeCommitteeFilter = "all";
let searchTerm = "";

const COMMITTEES = ["events", "fundraising", "media", "awareness"];

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
  const navLoggedOut = document.getElementById("nav-logged-out");
  const navLoggedIn = document.getElementById("nav-logged-in");

  if (currentUser) {
    await fetchOrCreateUserProfile(currentUser);
    portalView?.classList.add("hidden");
    websiteView?.classList.remove("hidden");
    subnav?.classList.remove("hidden");
    navLoggedOut?.classList.add("hidden");
    navLoggedIn?.classList.remove("hidden");
    await loadIdeasFeed();
    await loadEvents();
    await loadSpotlight();
  } else {
    currentProfile = null;
    portalView?.classList.remove("hidden");
    websiteView?.classList.add("hidden");
    subnav?.classList.add("hidden");
    navLoggedOut?.classList.remove("hidden");
    navLoggedIn?.classList.add("hidden");
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
    document.getElementById("username-modal")?.classList.remove("hidden");
  }

  const nav = document.getElementById("nav-username");
  if (nav) nav.innerText = currentProfile?.username ? `@${currentProfile.username}` : "@…";
  const accU = document.getElementById("acc-username-display");
  if (accU) accU.innerText = currentProfile?.username ? `@${currentProfile.username}` : "@…";
  const accE = document.getElementById("acc-email-display");
  if (accE) accE.innerText = user.email || "—";
  const accP = document.getElementById("acc-provider-display");
  if (accP) accP.innerText = user.app_metadata?.provider || "email";
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
  const signupGroup = document.getElementById("signup-fields-group");
  const submitBtn = document.getElementById("auth-submit-btn");
  const tabSignin = document.getElementById("auth-tab-signin");
  const tabSignup = document.getElementById("auth-tab-signup");

  if (mode === "signin") {
    signupGroup?.classList.add("hidden");
    if (submitBtn) submitBtn.innerHTML = `<span>Sign In to Chapter</span> <i class="fa-solid fa-arrow-right text-xs"></i>`;
    tabSignin?.classList.add("text-[#00ADEF]", "border-[#00ADEF]");
    tabSignin?.classList.remove("text-slate-400", "border-transparent");
    tabSignup?.classList.add("text-slate-400", "border-transparent");
    tabSignup?.classList.remove("text-[#00ADEF]", "border-[#00ADEF]");
  } else {
    signupGroup?.classList.remove("hidden");
    if (submitBtn) submitBtn.innerHTML = `<span>Create Chapter Account</span> <i class="fa-solid fa-user-plus text-xs"></i>`;
    tabSignup?.classList.add("text-[#00ADEF]", "border-[#00ADEF]");
    tabSignup?.classList.remove("text-slate-400", "border-transparent");
    tabSignin?.classList.add("text-slate-400", "border-transparent");
    tabSignin?.classList.remove("text-[#00ADEF]", "border-[#00ADEF]");
  }
};

window.showAuthPortal = function () {
  document.getElementById("portal-view")?.classList.remove("hidden");
  document.getElementById("website-view")?.classList.add("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
};

async function handleAuthSubmit(e) {
  e.preventDefault();
  const email = document.getElementById("auth-email").value.trim();
  const password = document.getElementById("auth-password").value.trim();

  if (authMode === "signup") {
    const username = document.getElementById("auth-username").value.trim();
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      return alert("Username must be 3–20 chars, letters/numbers/underscore only.");
    }
    if (!isStrongPassword(password)) {
      return alert("Password must be 8+ chars with lowercase, uppercase, and a number.");
    }

    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return alert("Sign Up Error: " + error.message);

    if (data.user) {
      const { error: upErr } = await supabase.from("profiles").upsert({
        id: data.user.id,
        username,
        auth_provider: "email"
      });
      if (upErr) console.warn("Profile upsert:", upErr.message);

      if (!data.session) alert("Check your email to confirm, then sign in.");
      else alert("Account created successfully!");
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
  const username = document.getElementById("onboard-username").value.trim();
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    return alert("Username must be 3–20 chars, letters/numbers/underscore only.");
  }

  const { data: existing } = await supabase.from("profiles").select("id").eq("username", username).maybeSingle();
  if (existing && existing.id !== currentUser.id) return alert("Username already taken.");

  const provider = currentUser.app_metadata?.provider || "email";
  const { error } = await supabase.from("profiles").upsert({
    id: currentUser.id, username, auth_provider: provider
  });
  if (error) return alert("Error saving username: " + error.message);

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
  alert("Password updated successfully!");
  e.target.reset();
}

async function handleSubmitIdea() {
  if (!currentUser) return alert("Please sign in to post ideas.");

  const title = document.getElementById("prop-title").value.trim();
  const committee = document.getElementById("prop-committee").value;
  const description = document.getElementById("prop-description").value.trim();
  const fileInput = document.getElementById("prop-file");
  const file = fileInput?.files[0];

  if (!title || !description) return alert("Please fill in all required fields.");
  if (!COMMITTEES.includes(committee)) return alert("Invalid committee.");

  let attachmentPath = null;

  if (file) {
    const MAX = 5 * 1024 * 1024;
    const ALLOWED = ["image/jpeg","image/png","image/gif","image/webp","application/pdf","text/plain","application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
    if (file.size > MAX) return alert("File too large. Max 5MB.");
    if (!ALLOWED.includes(file.type)) return alert("File type not allowed. Use image, PDF, txt, or Word.");

    const ext = file.name.split(".").pop();
    const path = `${currentUser.id}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("idea-attachments").upload(path, file);
    if (upErr) return alert("File upload error: " + upErr.message);
    attachmentPath = path;
  }

  const { error } = await supabase.from("ideas").insert([{
    user_id: currentUser.id, title, committee, description, attachment_url: attachmentPath
  }]);

  if (error) return alert("Error submitting proposal: " + error.message);

  alert("Proposal published!");
  document.getElementById("prop-title").value = "";
  document.getElementById("prop-description").value = "";
  if (fileInput) fileInput.value = "";
  window.closeProposalModal();
  await loadIdeasFeed();
}

async function loadIdeasFeed() {
  const feedEl = document.getElementById("ideas-feed-container");
  if (!feedEl) return;

  const { data, error } = await supabase.from("ideas").select("*, profiles!ideas_user_id_fkey(username)").order("created_at", { ascending: false });

  if (error) {
    feedEl.innerHTML = `<p class="text-red-500 font-semibold col-span-full">Error: ${escapeHtml(error.message)}</p>`;
    return;
  }

  allIdeas = data || [];
  document.getElementById("stat-approved-count").innerText = allIdeas.length;

  renderedIdeas = await Promise.all(allIdeas.map(async (item) => {
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
    feedEl.innerHTML = `<p class="text-slate-400 font-medium col-span-full text-center py-8">No matching proposals.</p>`;
    return;
  }

  feedEl.innerHTML = items.map(item => `
    <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between space-y-4">
      <div>
        <div class="flex items-center justify-between mb-2">
          <span class="px-2.5 py-1 rounded-md text-xs font-bold bg-blue-100 text-[#008CC3] uppercase">${escapeHtml(item.committee)}</span>
          <span class="text-xs text-slate-400 font-medium">${new Date(item.created_at).toLocaleDateString()}</span>
        </div>
        <h4 class="text-base font-bold text-slate-800 mb-1">${escapeHtml(item.title)}</h4>
        <p class="text-xs text-slate-600 leading-relaxed mb-3">${escapeHtml(item.description)}</p>
        ${item.signedUrl ? `
          <div class="mt-2 p-2 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between text-xs">
            <span class="font-medium text-slate-700 truncate">📎 Attached File</span>
            <a href="${item.signedUrl}" target="_blank" rel="noopener" class="text-[#00ADEF] hover:underline font-bold shrink-0 ml-2">View File</a>
          </div>` : ""}
      </div>
      <div class="pt-3 border-t border-slate-100 text-xs">
        <span class="font-semibold text-slate-500">By @${escapeHtml(item.profiles?.username || "student")}</span>
      </div>
    </div>
  `).join("");
}

window.filterCommittees = function (committee) {
  activeCommitteeFilter = committee;
  document.querySelectorAll(".filter-btn").forEach(btn => {
    btn.className = "filter-btn px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200";
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
  if (error) { grid.innerHTML = `<p class="text-red-500 col-span-full">Error: ${escapeHtml(error.message)}</p>`; return; }

  const now = new Date();
  const upcoming = (data || []).filter(e => new Date(e.event_date) >= now);
  const past = (data || []).filter(e => new Date(e.event_date) < now);
  document.getElementById("stat-events-count").innerText = upcoming.length;

  const card = (e) => `
    <div class="border border-slate-200 rounded-xl p-4 bg-slate-50">
      <div class="flex items-center justify-between mb-2">
        <span class="text-xs font-bold uppercase text-[#008CC3]">${escapeHtml(e.committee)}</span>
        <span class="text-xs text-slate-500">${new Date(e.event_date).toLocaleDateString()}</span>
      </div>
      <h4 class="font-bold text-slate-800 mb-1">${escapeHtml(e.title)}</h4>
      <p class="text-xs text-slate-600 mb-2">${escapeHtml(e.description)}</p>
      <p class="text-xs text-slate-500"><i class="fa-solid fa-location-dot mr-1"></i>${escapeHtml(e.location)}</p>
    </div>`;

  grid.innerHTML = `
    <div class="col-span-full">
      <h4 class="font-bold text-slate-700 mb-2">Upcoming Events</h4>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        ${upcoming.length ? upcoming.map(card).join("") : `<p class="text-sm text-slate-400">No upcoming events.</p>`}
      </div>
    </div>
    <div class="col-span-full mt-6">
      <h4 class="font-bold text-slate-700 mb-2">Past Events</h4>
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
  window.closeEventModal();
  e.target.reset();
  await loadEvents();
}

async function loadSpotlight() {
  try {
    const { data, error } = await supabase.from("monthly_issues").select("*").eq("is_active", true).limit(1).maybeSingle();
    if (error || !data) return;
    const t = document.getElementById("spotlight-title"); if (t) t.innerText = data.title;
    const d = document.getElementById("spotlight-description"); if (d) d.innerText = data.description;
    const i = document.getElementById("spotlight-image"); if (i && data.image_url) i.src = data.image_url;
  } catch (_) { }
}

function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));
}

window.openProposalModal = () => document.getElementById("proposal-modal")?.classList.remove("hidden");
window.closeProposalModal = () => document.getElementById("proposal-modal")?.classList.add("hidden");
window.openEventModal = () => document.getElementById("event-modal")?.classList.remove("hidden");
window.closeEventModal = () => document.getElementById("event-modal")?.classList.add("hidden");
window.navigateToHome = () => window.scrollTo({ top: 0, behavior: "smooth" });

window.switchTab = function (tabName) {
  ["feed","events","spotlight","account"].forEach(t => {
    const sec = document.getElementById(`sec-${t}`);
    const btn = document.getElementById(`tab-btn-${t}`);
    if (sec) sec.classList.toggle("hidden", t !== tabName);
    if (btn) {
      btn.className = t === tabName
        ? "nav-tab-btn flex items-center space-x-2 px-3 py-2 text-sm font-semibold text-[#00ADEF] border-b-2 border-[#00ADEF] whitespace-nowrap"
        : "nav-tab-btn flex items-center space-x-2 px-3 py-2 text-sm font-semibold text-slate-600 hover:text-[#00ADEF] border-b-2 border-transparent whitespace-nowrap";
    }
  });
};
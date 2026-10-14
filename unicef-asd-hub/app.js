import { supabase } from "./config.js";

let currentUser = null;
let currentProfile = null;

document.addEventListener("DOMContentLoaded", () => {
  setupEventListeners();
  initializeAuth();
  loadIdeasFeed();
});

function setupEventListeners() {
  const authForm = document.getElementById("auth-form");
  const logoutBtn = document.getElementById("logout-btn");
  const submitIdeaBtn = document.getElementById("submit-idea-btn");
  const githubBtn = document.getElementById("github-signin-btn");

  if (authForm) authForm.addEventListener("submit", handleAuthSubmit);
  if (logoutBtn) logoutBtn.addEventListener("click", handleSignOut);
  if (submitIdeaBtn) submitIdeaBtn.addEventListener("click", handleSubmitIdea);
  if (githubBtn) githubBtn.addEventListener("click", handleGitHubSignIn);
}

async function initializeAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    await updateAuthState(session.user);
  } else {
    updateAuthState(null);
  }

  supabase.auth.onAuthStateChange(async (_event, session) => {
    if (session?.user) {
      await updateAuthState(session.user);
    } else {
      updateAuthState(null);
    }
  });
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
  } else {
    currentProfile = null;
    portalView?.classList.remove("hidden");
    websiteView?.classList.add("hidden");
    subnav?.classList.add("hidden");
    navLoggedOut?.classList.remove("hidden");
    navLoggedIn?.classList.add("hidden");
  }
}

async function fetchOrCreateUserProfile(user) {
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (data) {
    currentProfile = data;
  } else {
    const fallbackUsername = user.user_metadata?.preferred_username || user.email?.split("@")[0] || `user_${Date.now()}`;
    const provider = user.app_metadata?.provider || 'email';

    const { data: newProfile } = await supabase
      .from("profiles")
      .insert([{ id: user.id, username: fallbackUsername, auth_provider: provider }])
      .select()
      .single();

    currentProfile = newProfile || { id: user.id, username: fallbackUsername, auth_provider: provider };
  }

  const welcomeEl = document.getElementById("nav-username");
  if (welcomeEl) welcomeEl.innerText = `@${currentProfile.username}`;
}

export async function handleGitHubSignIn() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: {
      redirectTo: window.location.href
    }
  });
  if (error) alert("GitHub Sign-In Error: " + error.message);
}

let authMode = "signin";

window.toggleAuthTab = function(mode) {
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

async function handleAuthSubmit(e) {
  e.preventDefault();
  const email = document.getElementById("auth-email").value.trim();
  const password = document.getElementById("auth-password").value.trim();

  if (authMode === "signup") {
    const username = document.getElementById("auth-username").value.trim();
    if (!username) return alert("Please choose a username.");

    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return alert("Sign Up Error: " + error.message);

    if (data.user) {
      const { error: profileError } = await supabase
        .from("profiles")
        .insert([{ id: data.user.id, username, auth_provider: "email" }]);

      if (profileError) console.error("Profile creation notice:", profileError.message);
      alert("Account created successfully!");
    }
  } else {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert("Sign In Error: " + error.message);
  }
}

async function handleSignOut() {
  await supabase.auth.signOut();
}

async function handleSubmitIdea() {
  if (!currentProfile) return alert("Please sign in to post ideas.");

  const title = document.getElementById("prop-title").value.trim();
  const committee = document.getElementById("prop-committee").value;
  const description = document.getElementById("prop-description").value.trim();
  const fileInput = document.getElementById("prop-file");
  const file = fileInput?.files[0];

  if (!title || !description) return alert("Please fill in all required fields.");

  let attachmentUrl = null;

  if (file) {
    const fileExt = file.name.split('.').pop();
    const filePath = `ideas/${currentProfile.id}_${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('idea-attachments')
      .upload(filePath, file);

    if (uploadError) {
      return alert("File upload error: " + uploadError.message);
    }

    const { data: urlData } = supabase.storage
      .from('idea-attachments')
      .getPublicUrl(filePath);

    attachmentUrl = urlData.publicUrl;
  }

  const { error } = await supabase.from("ideas").insert([
    { 
      user_id: currentProfile.id, 
      title, 
      committee, 
      description, 
      attachment_url: attachmentUrl
    }
  ]);

  if (error) {
    alert("Error submitting proposal: " + error.message);
  } else {
    alert("Proposal published!");
    document.getElementById("prop-title").value = "";
    document.getElementById("prop-description").value = "";
    if (fileInput) fileInput.value = "";
    closeProposalModal();
    loadIdeasFeed();
  }
}

async function loadIdeasFeed() {
  const feedEl = document.getElementById("ideas-feed-container");
  if (!feedEl) return;

  const { data, error } = await supabase
    .from("ideas")
    .select("*, profiles(username)")
    .order("created_at", { ascending: false });

  if (error) {
    feedEl.innerHTML = `<p class="text-red-500 font-semibold col-span-full">Error loading feed: ${error.message}</p>`;
    return;
  }

  if (!data || data.length === 0) {
    feedEl.innerHTML = `<p class="text-slate-400 font-medium col-span-full text-center py-8">No proposals shared yet. Be the first to post!</p>`;
    return;
  }

  feedEl.innerHTML = data.map(item => `
    <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between space-y-4">
      <div>
        <div class="flex items-center justify-between mb-2">
          <span class="px-2.5 py-1 rounded-md text-xs font-bold bg-blue-100 text-[#008CC3] uppercase">
            ${item.committee}
          </span>
          <span class="text-xs text-slate-400 font-medium">
            ${new Date(item.created_at).toLocaleDateString()}
          </span>
        </div>

        <h4 class="text-base font-bold text-slate-800 mb-1">${escapeHtml(item.title)}</h4>
        <p class="text-xs text-slate-600 leading-relaxed mb-3">${escapeHtml(item.description)}</p>

        ${item.attachment_url ? `
          <div class="mt-2 p-2 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between text-xs">
            <span class="font-medium text-slate-700 truncate">📎 Attached File</span>
            <a href="${item.attachment_url}" target="_blank" class="text-[#00ADEF] hover:underline font-bold shrink-0 ml-2">
              View File
            </a>
          </div>
        ` : ''}
      </div>

      <div class="pt-3 border-t border-slate-100 text-xs">
        <span class="font-semibold text-slate-500">By @${escapeHtml(item.profiles?.username || "student")}</span>
      </div>
    </div>
  `).join("");
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, match => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[match]));
}

window.openProposalModal = function() {
  document.getElementById('proposal-modal')?.classList.remove('hidden');
};

window.closeProposalModal = function() {
  document.getElementById('proposal-modal')?.classList.add('hidden');
};

window.switchTab = function(tabName) {
  ['feed', 'events', 'spotlight', 'account'].forEach(t => {
    const sec = document.getElementById(`sec-${t}`);
    const btn = document.getElementById(`tab-btn-${t}`);
    if (sec) sec.classList.toggle('hidden', t !== tabName);
    if (btn) {
      if (t === tabName) {
        btn.className = "nav-tab-btn flex items-center space-x-2 px-3 py-2 text-sm font-semibold text-[#00ADEF] border-b-2 border-[#00ADEF] whitespace-nowrap";
      } else {
        btn.className = "nav-tab-btn flex items-center space-x-2 px-3 py-2 text-sm font-semibold text-slate-600 hover:text-[#00ADEF] border-b-2 border-transparent whitespace-nowrap";
      }
    }
  });
};
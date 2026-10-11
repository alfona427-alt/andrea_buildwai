import { supabase } from "./config.js";

let currentUser = null;
let currentProfile = null;

document.addEventListener("DOMContentLoaded", () => {
  setupEventListeners();
  initializeAuth();
  loadApprovedIdeas();
});

function setupEventListeners() {
  const signinBtn = document.getElementById("signin-btn");
  const signupBtn = document.getElementById("signup-btn");
  const logoutBtn = document.getElementById("logout-btn");
  const submitIdeaBtn = document.getElementById("submit-idea-btn");
  const githubBtn = document.getElementById("github-signin-btn");

  if (signinBtn) signinBtn.addEventListener("click", handleSignIn);
  if (signupBtn) signupBtn.addEventListener("click", handleSignUp);
  if (logoutBtn) logoutBtn.addEventListener("click", handleSignOut);
  if (submitIdeaBtn) submitIdeaBtn.addEventListener("click", handleSubmitIdea);
  if (githubBtn) githubBtn.addEventListener("click", handleGitHubSignIn);
}

async function initializeAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    await updateAuthState(session.user);
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
  if (currentUser) {
    await fetchOrCreateUserProfile(currentUser);
    document.getElementById("auth-section")?.classList.add("hidden");
    document.getElementById("dashboard-section")?.classList.remove("hidden");
    document.getElementById("logout-btn")?.classList.remove("hidden");
  } else {
    currentProfile = null;
    document.getElementById("auth-section")?.classList.remove("hidden");
    document.getElementById("dashboard-section")?.classList.add("hidden");
    document.getElementById("logout-btn")?.classList.add("hidden");
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
    // Fallback for new GitHub / OAuth sign-ins
    const fallbackUsername = user.user_metadata?.preferred_username || user.email?.split("@")[0] || `user_${Date.now()}`;
    const provider = user.app_metadata?.provider || 'email';

    const { data: newProfile } = await supabase
      .from("profiles")
      .insert([{ id: user.id, username: fallbackUsername, role: "member", auth_provider: provider }])
      .select()
      .single();

    currentProfile = newProfile || { id: user.id, username: fallbackUsername, role: "member", auth_provider: provider };
  }

  const welcomeEl = document.getElementById("welcome-msg");
  const roleEl = document.getElementById("user-role-badge");
  if (welcomeEl) welcomeEl.innerText = `Welcome, @${currentProfile.username}!`;
  if (roleEl) roleEl.innerText = `Role: ${currentProfile.role.toUpperCase()}`;
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

async function handleSignUp() {
  const email = document.getElementById("auth-email").value.trim();
  const password = document.getElementById("auth-password").value.trim();
  const username = document.getElementById("auth-username").value.trim();

  if (!email || !password || !username) {
    alert("Please enter an email, password, and username.");
    return;
  }

  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return alert(error.message);

  if (data.user) {
    const { error: profileError } = await supabase
      .from("profiles")
      .insert([{ id: data.user.id, username, role: "member", auth_provider: "email" }]);

    if (profileError) alert("Error creating profile: " + profileError.message);
    else alert("Account created successfully!");
  }
}

async function handleSignIn() {
  const email = document.getElementById("auth-email").value.trim();
  const password = document.getElementById("auth-password").value.trim();

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) alert(error.message);
}

async function handleSignOut() {
  await supabase.auth.signOut();
}

async function handleSubmitIdea() {
  if (!currentProfile) return;

  const title = document.getElementById("idea-title").value.trim();
  const committee = document.getElementById("idea-committee").value;
  const description = document.getElementById("idea-description").value.trim();

  if (!title || !description) return alert("Please fill in all fields.");

  const { error } = await supabase.from("ideas").insert([
    { user_id: currentProfile.id, title, committee, description, status: "pending" }
  ]);

  if (error) {
    alert("Error submitting proposal: " + error.message);
  } else {
    alert("Proposal submitted! Pending Executive review.");
    document.getElementById("idea-title").value = "";
    document.getElementById("idea-description").value = "";
  }
}

async function loadApprovedIdeas() {
  const feedEl = document.getElementById("ideas-feed");
  if (!feedEl) return;

  const { data, error } = await supabase
    .from("ideas")
    .select("*, profiles(username)")
    .eq("status", "approved")
    .order("created_at", { ascending: false });

  if (error) {
    feedEl.innerHTML = `<p style="color: red;">Error loading feed: ${error.message}</p>`;
    return;
  }

  if (!data || data.length === 0) {
    feedEl.innerHTML = "<p>No approved ideas yet.</p>";
    return;
  }

  feedEl.innerHTML = data.map(item => `
    <div style="border-bottom: 1px solid #ddd; padding: 8px 0;">
      <h4>${item.title} <small>(${item.committee.toUpperCase()})</small></h4>
      <p>${item.description}</p>
      <small>By @${item.profiles?.username || "unknown"}</small>
    </div>
  `).join("");
}
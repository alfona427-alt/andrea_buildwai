import { supabase } from "./config.js";

let currentUser = null;
let currentProfile = null;

document.addEventListener("DOMContentLoaded", () => {
  setupEventListeners();
  initializeAuth();
  loadApprovedIdeas();
});

function setupEventListeners() {
  document.getElementById("signin-btn").addEventListener("click", handleSignIn);
  document.getElementById("signup-btn").addEventListener("click", handleSignUp);
  document.getElementById("logout-btn").addEventListener("click", handleSignOut);
  document.getElementById("submit-idea-btn").addEventListener("click", handleSubmitIdea);
}

async function initializeAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  updateAuthState(session?.user || null);

  supabase.auth.onAuthStateChange((_event, session) => {
    updateAuthState(session?.user || null);
  });
}

async function updateAuthState(user) {
  currentUser = user;
  if (currentUser) {
    await fetchUserProfile(currentUser.id);
    document.getElementById("auth-section").classList.add("hidden");
    document.getElementById("dashboard-section").classList.remove("hidden");
    document.getElementById("logout-btn").classList.remove("hidden");
  } else {
    currentProfile = null;
    document.getElementById("auth-section").classList.remove("hidden");
    document.getElementById("dashboard-section").classList.add("hidden");
    document.getElementById("logout-btn").classList.add("hidden");
  }
}

async function fetchUserProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (data) {
    currentProfile = data;
    document.getElementById("welcome-msg").innerText = `Welcome, @${data.username}!`;
    document.getElementById("user-role-badge").innerText = `Role: ${data.role.toUpperCase()}`;
  }
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
      .insert([{ id: data.user.id, username, auth_provider: "email" }]);

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
# PROJECT.md — UNICEF ASD Chapter Hub (Complete Prompt Specification)

## 1. App Idea & Target User

### App Overview
The **UNICEF ASD Chapter Hub** is a dedicated mobile-first digital portal for the UNICEF ASD (American School of Dhahran) club chapter. The platform centralizes club communication, event scheduling, committee initiatives, media asset sharing, and community governance under a structured, secure workflow.

To maintain quality, governance, and safety, the application enforces a strict **Role-Based Exec-Approval Queue**, **File Storage Gating**, **Row-Level Security (RLS)**, and a **Content Moderation Engine**:
- Standard members submit proposals, file attachments, and event suggestions. All submissions and uploaded files remain private and unlisted until reviewed and approved by an Admin or Moderator.
- File attachments uploaded via Supabase Storage require explicit approval before public download or preview links are generated.
- **Post Deletion**: Both the original author and Admins/Moderators can delete submitted proposals (both `pending` and `approved`), automatically removing any associated storage attachments.
- **Account Deletion**: Users can permanently delete their own accounts at any time from the Account settings panel, which cascades to remove their profile, badges, files, and proposals.
- High-impact operations (post deletions, account deletions, user bans, proposal status changes) require explicit **"Are You Sure?" modal confirmations** to prevent accidental touch actions.

### Target Roles & Persona Hierarchy
- **Admin (`president`)**:
  - Full application governance.
  - Accesses the Moderation Panel, manages global settings, assigns user roles (`president`, `moderator`, `member`), manually assigns custom **Badges** to members, resolves moderation reports, executes any item/file deletion, and manages the Monthly Cause Spotlight.
- **Moderator (`moderator`)**:
  - Comprises senior executives (e.g., **Event Coordinator**, **Fundraising Lead**, **Media Lead**).
  - Accesses the Moderation Panel, reviews pending proposal queues, approves/rejects committee items and pending file attachments, manages calendar events, manually assigns badges, resolves reports, and executes content deletions.
- **Member (`member`)**:
  - General chapter members.
  - Submits committee proposals and uploads media/documents (which enter a pending queue), views approved calendar events and approved public files, deletes their own pending or approved proposals, deletes their own account, reports inappropriate content, and views user profiles and badges. The Moderation Panel is completely hidden and restricted at both UI and database RLS levels.

---

## 2. Core Functional Modules & Safeguards

### Module A: Authentication, Profiles, Manual Badges & Self-Deletion
- **Authentication Flows**:
  - Dual sign-in via GitHub OAuth and Email/Password with session persistence via Supabase Auth.
  - Enforced password complexity rules ($\ge 8$ characters, uppercase, lowercase, numbers).
  - Mandatory `@username` setup during onboarding.
- **Manual Badge Management System**:
  - Badges are created and assigned manually by Admins or Moderators through the Moderation Panel.
  - Badge types include administrative titles (e.g., 👑 `President`, 🛡️ `Moderator`), committee positions (e.g., 🎨 `Event Lead`, 💰 `Fundraising Lead`, 📱 `Media Lead`), and custom honors (e.g., ⭐ `Star Volunteer`, ✅ `Verified Member`).
- **Self-Service Account Deletion**:
  - Available in the **Account** tab under the Danger Zone section.
  - Executes the `delete_own_account()` Supabase RPC function after modal confirmation, purging storage uploads and deleting the `auth.users` record (`ON DELETE CASCADE`).

### Module B: Mobile-First UX & Touch Optimizations
- **Mobile Responsive Architecture**:
  - Responsive sub-navigation bar with horizontal scroll on mobile viewports and desktop layout fallback.
  - Touch-friendly action buttons with minimum touch target height of $44\text{px}$.
  - Optimized card lists and modal dialogs.

### Module C: Exec-Approval Queue & Gated Storage Workflow
- **Committee Categories**:
  - 🎨 **Events**: Logistics, venue requests, scheduling.
  - 💰 **Fundraising**: Charity drives, budget proposals, sponsor contacts.
  - 📱 **Media**: Flyers, graphics, social media asset approvals.
  - 💡 **Awareness**: Educational drives and child welfare advocacy.
- **Approval & File Gating Workflow**:
  - Ideas and file uploads start in a `pending` state visible only to the creator, Moderators, and the President.
  - Approving a proposal/file generates a signed access URL and transitions status to `approved`. Rejection sets status to `rejected`.

### Module D: Community Reporting & Moderation Engine
- **Report Submission System**:
  - Users can flag any idea, event, asset file, or user profile using a persistent **"Report" action button**.
  - Triggers a modal asking for the reporting reason (`Spam`, `Inappropriate Content`, `Harassment`, `Off-topic`, `Other`).
- **Moderation Dashboard**:
  - Accessible strictly to `moderator` and `president` roles.
  - Options to **Approve**, **Reject**, or **Delete** pending submissions, **Dismiss** or **Resolve** reports, assign badges, and update member roles.

### Module E: "Are You Sure?" Modal Safeguards & Deletion Rules
- **Post Deletion**: Allowed for both the proposal's creator (`auth.uid() = user_id`) and Admins/Moderators (`is_mod_or_admin()`) across both `pending` and `approved` proposals.
- Any destructive operation triggers an explicit system modal prompt:
  - **Deleting Proposals**: *"Are you sure you want to permanently delete this proposal? This action cannot be undone."* [Cancel] / [Confirm]
  - **Deleting Account**: *"This will permanently delete your account, profile, badges, and all your proposals. This action cannot be undone."* [Cancel] / [Confirm]
  - **Rejecting Proposals**: *"Are you sure you want to reject this submission?"* [Cancel] / [Confirm]

---

## 3. Database Schema & RLS Policies (Supabase PostgreSQL)

```sql
-- ENUM TYPES FOR ROLES, COMMITTEES, AND STATUSES
CREATE TYPE user_role AS ENUM ('president', 'moderator', 'member');
CREATE TYPE committee_type AS ENUM ('events', 'fundraising', 'media', 'awareness');
CREATE TYPE proposal_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE report_status AS ENUM ('open', 'under_review', 'resolved', 'dismissed');

-- TABLE: profiles
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  auth_provider TEXT DEFAULT 'email',
  role user_role DEFAULT 'member',
  is_banned BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- TABLE: badges (Manually managed by President/Moderators)
CREATE TABLE badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  icon TEXT NOT NULL,
  description TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- TABLE: user_badges (Junction for Manual Assignments)
CREATE TABLE user_badges (
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  badge_id UUID REFERENCES badges(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES profiles(id),
  assigned_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, badge_id)
);

-- TABLE: ideas (Proposals & Gated Media Submissions)
CREATE TABLE ideas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  committee committee_type NOT NULL,
  attachment_url TEXT,
  status proposal_status DEFAULT 'pending',
  reviewed_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- TABLE: events
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  event_date TIMESTAMPTZ NOT NULL,
  location TEXT NOT NULL,
  committee committee_type NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- TABLE: reports
CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('idea', 'event', 'profile', 'file')),
  target_id UUID NOT NULL,
  reason TEXT NOT NULL,
  details TEXT,
  status report_status DEFAULT 'open',
  resolved_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- TABLE: monthly_issues
CREATE TABLE monthly_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  image_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
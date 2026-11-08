# PROJECT.md — UNICEF ASD Chapter Hub (Complete Prompt Specification)

## 1. App Idea & Target User

### App Overview
The **UNICEF ASD Chapter Hub** is a dedicated mobile-first digital portal for the UNICEF ASD (American School of Doha) club chapter. The platform centralizes club communication, event scheduling, committee initiatives, media asset sharing, and community governance under a structured, secure workflow.

To maintain quality, governance, and safety, the application enforces a strict **Role-Based Exec-Approval Queue**, **File Storage Gating**, and a **Content Moderation Engine**:
- Standard members submit proposals, file attachments, and event suggestions. All submissions and uploaded files remain private and unlisted until reviewed and approved by an Admin or Moderator.
- File attachments uploaded via Supabase Storage require explicit approval before public download or preview links are generated.
- Standard members **cannot** delete submitted content. Deletion is strictly reserved for Admins and Moderators.
- High-impact operations (deletions, user bans, proposal status changes) require explicit **"Are You Sure?" modal confirmations** to prevent accidental touch actions.

### Target Roles & Persona Hierarchy
- **Admin (`president`)**:
  - Full application governance.
  - Manages global settings, assigns user roles (`president`, `moderator`, `member`), manually creates and assigns custom **Badges** to members, resolves moderation reports, executes item/file deletions, and manages the Monthly Cause Spotlight.
- **Moderator (`senior_exec`)**:
  - Comprises senior executives (e.g., **Event Coordinator**, **Fundraising Lead**, **Media Lead**).
  - Reviews pending proposal queues, approves/rejects committee items and pending file attachments, manages calendar events, manually assigns badges, resolves reports, and executes content deletions.
- **Member (`member`)**:
  - General chapter members.
  - Submits committee proposals and uploads media/documents (which enter a pending queue), views approved calendar events and approved public files, reports inappropriate content, and views user profiles and badges.

---

## 2. Core Functional Modules & Safeguards

### Module A: Authentication, Profiles & Manual Badges System
- **Authentication Flows**:
  - Dual sign-in via GitHub OAuth and Email/Password with session persistence via Supabase Auth.
  - Enforced password complexity rules ($\ge 8$ characters, uppercase, lowercase, numbers).
  - Mandatory `@username` setup during onboarding.
- **Manual Badge Management System**:
  - Badges are created and assigned manually by Admins or Moderators through a dedicated Admin/Mod Management Panel.
  - Badge types include administrative titles (e.g., 👑 `President`, 🛡️ `Moderator`), committee positions (e.g., 🎨 `Event Lead`, 💰 `Fundraising Lead`, 📱 `Media Lead`), and custom honors (e.g., ⭐ `Star Volunteer`, ✅ `Verified Member`).
  - Badges appear next to usernames across all feeds, proposal cards, event listings, and user profiles.

### Module B: Mobile-First UX & Touch Optimizations
- **Mobile Responsive Architecture**:
  - Off-canvas drawer navigation for mobile viewports ($<768\text{px}$) with standard desktop navigation fallback ($>768\text{px}$).
  - Touch-friendly action buttons with minimum touch target height of $44\text{px}$.
  - Sticky bottom action bars for mobile submission forms and modal dialogs.
  - Optimized card lists with responsive pagination and pull-to-refresh capabilities.

### Module C: Exec-Approval Queue & Gated Storage Workflow
- **Committee Categories**:
  - 🎨 **Events**: Logistics, venue requests, scheduling.
  - 💰 **Fundraising**: Charity drives, budget proposals, sponsor contacts.
  - 📱 **Media**: Flyers, graphics, social media asset approvals.
  - 💡 **Awareness**: Educational drives and child welfare advocacy.
- **Approval & File Gating Workflow**:
  - Ideas and file uploads start in a `pending` state visible only to the creator, Moderators, and the President.
  - Files uploaded to Supabase Storage are bucketed under `/pending/` and access links are gated until approved.
  - Approving a proposal/file generates a public access URL and transitions status to `approved`. Rejection sets status to `rejected`.

### Module D: Community Reporting & Moderation Engine
- **Report Submission System**:
  - Users can flag any idea, event, asset file, or user profile using a persistent **"Report" action button** (triangular warning icon).
  - Triggers a modal asking for the reporting reason (`Spam`, `Inappropriate Content`, `Harassment`, `Off-topic`, `Other`).
- **Moderation Dashboard**:
  - Admins and Moderators receive incoming reports in real-time.
  - Options to **Dismiss Report**, **Remove Content**, or **Ban User** (`is_banned = true`).

### Module E: "Are You Sure?" Modal Safeguards & Deletion Restrictions
- Standard members do **not** have delete privileges for any submitted content or files once created.
- Deletion actions can **only** be executed by Admins or Moderators.
- Any destructive operation triggers an explicit system modal prompt:
  - **Deleting Content/Files**: *"Are you sure you want to permanently delete this item/file? This action cannot be undone."* [Cancel] / [Confirm Delete]
  - **Banning Users**: *"Are you sure you want to ban @username? They will lose posting and submission privileges immediately."* [Cancel] / [Confirm Ban]
  - **Rejecting Proposals/Assets**: *"Are you sure you want to reject this submission?"* [Cancel] / [Confirm Rejection]

---

## 3. Database Schema (Supabase PostgreSQL)

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
  icon TEXT NOT NULL, -- Emoji or icon identifier
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
  attachment_url TEXT, -- Gated until approved
  status proposal_status DEFAULT 'pending',
  reviewed_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- TABLE: events
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES profiles(id),
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
  image_url
# PROJECT.md — UNICEF ASD Chapter Hub

## 1. App Idea & Target User

### App Overview
The **UNICEF ASD Chapter Hub** is a dedicated digital portal for the UNICEF ASD (American School of Doha) club chapter. The platform centralizes club communication, event scheduling, committee initiatives, and file sharing under a unified workflow. 

To maintain quality and safety, the app uses an **Exec-Approval Queue**: ideas, files, and event suggestions submitted by standard members remain private to the submitter and executive board until reviewed and approved by an Executive Member.

### Target User (Real-World Role)
- **Sarah — Executive Board Vice-President**: Sarah manages overall club logistics and committee operations. She logs into the Admin Dashboard daily to review pending member submissions, approve or reject event ideas, maintain the club calendar (upcoming and past events), manage file uploads, and moderate community reports.

---

## 2. Core Functional Modules

1. **Authentication & Identity Management**
   - **Dual Sign-In Options**:
     - **GitHub OAuth**: Fast single-click sign-in using standard GitHub OAuth credentials.
     - **Standard Email & Password**: Classic sign-up and sign-in flow with email authentication.
   - **Session Persistence**: Automated session management via Supabase Auth keeping users signed in across page refreshes, with dedicated sign-out functionality.
   - **Password Security Policies**: Enforced minimum password criteria (at least 8 characters long, containing lowercase letters, uppercase letters, and numbers).
   - **Self-Service Security**: Dedicated **Change Password** page for users who authenticated via email/password.
   - **Unique Usernames**: Mandatory unique `@username` selection during first sign-in onboarding, which is displayed publicly across all modules instead of user email addresses.

2. **Committee Organization**
   - Dedicated spaces categorized into four core club committees:
     - 🎨 **Events**: Logistics, venue planning, and scheduling.
     - 💰 **Fundraising**: Donation drives, budget proposals, and sponsor outreach.
     - 📱 **Media**: Social media campaign graphics, flyers, and promotional media.
     - 💡 **Awareness**: Educational initiatives, advocacy materials, and child welfare campaigns.

3. **Exec-Approval Workflow & Moderation**
   - Members post proposals or files with an initial status of `pending`.
   - Items are hidden from the general club feed until set to `approved` by an Exec.
   - Execs have an **Admin/Approval Dashboard** to approve/reject content.
   - Community reporting feature to flag inappropriate content or users.
   - User banning mechanism (`is_banned` flag) managed by Execs to revoke post/upload privileges.

4. **Event Calendar & Repositories**
   - Categorized views for **Upcoming Events** (`event_date >= NOW()`) and **Past Events** (`event_date < NOW()`).
   - Shared gallery and file repository for event flyers, budget sheets, and media assets.

5. **Chapter Branding & Monthly Cause Spotlight**
   - Tailored UI using UNICEF brand colors: Cyan/Blue (`#00ADEF`), White (`#FFFFFF`), and Charcoal Gray (`#1C2B36`), alongside ASD chapter branding elements.
   - **"About Us"** section highlighting UNICEF's global mission and local chapter goals.
   - Dynamic **Monthly Issue Spotlight** module highlighting specific global issues UNICEF deals with (updatable by Execs).

---

## 3. Database Schema (Supabase PostgreSQL)

### Table: `profiles`
*Extends `auth.users` with application-specific user profile metadata.*

| Column Name | Data Type | Constraints / Details |
| :--- | :--- | :--- |
| `id` | `uuid` | Primary Key, references `auth.users(id)` ON DELETE CASCADE |
| `username` | `text` | Unique, non-null, set on onboarding |
| `auth_provider` | `text` | Auth source indicator (e.g., `'email'` or `'github'`) |
| `role` | `text` | Default `'member'`. Allowed values: `'member'`, `'exec'` |
| `is_banned` | `boolean` | Default `false`. If true, user cannot write data |
| `created_at` | `timestamptz` | Default `now()` |
| `updated_at` | `timestamptz` | Default `now()` |

### Table: `ideas`
*Stores committee proposals, submissions, and attached resource links.*

| Column Name | Data Type | Constraints / Details |
| :--- | :--- | :--- |
| `id` | `uuid` | Primary Key, default `gen_random_uuid()` |
| `user_id` | `uuid` | References `profiles(id)` |
| `title` | `text` | Non-null, title of proposal |
| `description` | `text` | Non-null, detailed proposal body |
| `committee` | `text` | Allowed values: `'events'`, `'fundraising'`, `'media'`, `'awareness'` |
| `attachment_url` | `text` | Optional URL to file in Supabase Storage |
| `status` | `text` | Default `'pending'`. Allowed values: `'pending'`, `'approved'`, `'rejected'` |
| `created_at` | `timestamptz` | Default `now()` |

### Table: `events`
*Stores master club calendar items managed by Execs.*

| Column Name | Data Type | Constraints / Details |
| :--- | :--- | :--- |
| `id` | `uuid` | Primary Key, default `gen_random_uuid()` |
| `created_by` | `uuid` | References `profiles(id)` |
| `title` | `text` | Non-null, event name |
| `description` | `text` | Non-null, event outline |
| `event_date` | `timestamptz` | Non-null, scheduled event date/time |
| `location` | `text` | Non-null, physical room or virtual meeting link |
| `committee` | `text` | Committee managing the event |
| `created_at` | `timestamptz` | Default `now()` |

### Table: `reports`
*Stores moderation reports filed by members regarding content or users.*

| Column Name | Data Type | Constraints / Details |
| :--- | :--- | :--- |
| `id` | `uuid` | Primary Key, default `gen_random_uuid()` |
| `reporter_id` | `uuid` | References `profiles(id)` |
| `target_type` | `text` | Allowed values: `'idea'`, `'file'`, `'user'` |
| `target_id` | `uuid` | Foreign key reference to target entity ID |
| `reason` | `text` | Non-null, explanation of violation |
| `status` | `text` | Default `'open'`. Allowed values: `'open'`, `'resolved'` |
| `created_at` | `timestamptz` | Default `now()` |

### Table: `monthly_issues`
*Stores details for the dynamic spotlight cause.*

| Column Name | Data Type | Constraints / Details |
| :--- | :--- | :--- |
| `id` | `uuid` | Primary Key, default `gen_random_uuid()` |
| `title` | `text` | Non-null, title of issue |
| `description` | `text` | Non-null, detailed overview of the campaign |
| `image_url` | `text` | Image banner URL |
| `is_active` | `boolean` | Default `false`. Only one active record at a time |
| `updated_at` | `timestamptz` | Default `now()` |

---

## 4. Row-Level Security (RLS) Policies

All tables have Row-Level Security explicitly enabled (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`).

```sql
-- PROFILES POLICIES
-- Anyone signed in can view profiles/usernames
CREATE POLICY "Public profiles are viewable by signed-in users" 
ON profiles FOR SELECT TO authenticated USING (true);

-- Users can update their own profile (except role and ban status)
CREATE POLICY "Users can update own profile" 
ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- IDEAS POLICIES (Exec-Approval Workflow)
-- Members view their own ideas OR approved ideas. Execs view ALL ideas.
CREATE POLICY "View ideas policy" 
ON ideas FOR SELECT TO authenticated 
USING (
  auth.uid() = user_id 
  OR status = 'approved'
  OR EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() AND profiles.role = 'exec'
  )
);

-- Unbanned members can create ideas
CREATE POLICY "Insert ideas policy" 
ON ideas FOR INSERT TO authenticated 
WITH CHECK (
  auth.uid() = user_id 
  AND EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() AND profiles.is_banned = false
  )
);

-- Only Execs can update idea status (Approve/Reject)
CREATE POLICY "Execs can update ideas" 
ON ideas FOR UPDATE TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() AND profiles.role = 'exec'
  )
);

-- EVENTS POLICIES
-- All signed-in users can view calendar events
CREATE POLICY "View events policy" 
ON events FOR SELECT TO authenticated USING (true);

-- Only Execs can create, update, or delete calendar events
CREATE POLICY "Execs manage events" 
ON events FOR ALL TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() AND profiles.role = 'exec'
  )
);
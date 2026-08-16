# Attendance Management System

A beginner-maintainable attendance app using HTML, CSS, vanilla JavaScript, Supabase and Netlify.

## Files

- `index.html` — student login
- `admin-login.html` — administrator login
- `admin.html` — protected admin dashboard
- `css/style.css` — responsive UI
- `js/config.js` — public Supabase configuration
- `js/student.js` — student login/attendance logic
- `js/admin.js` — dashboard logic
- `database/database.sql` — complete database/RLS/RPC setup
- `netlify.toml` — Netlify configuration

## 1. Create Supabase project

Create a fresh Supabase project.

Open **SQL Editor**, create a new query, paste all of `database/database.sql`, and run it.

Do not put a service-role key anywhere in this repository.

## 2. Create an administrator

In Supabase, open **Authentication → Users** and create an email/password user.

Copy that user's UUID.

Then run this in SQL Editor:

```sql
insert into public.admin_profiles(id)
values ('PASTE-AUTH-USER-UUID-HERE');
```

Only users listed in `admin_profiles` are administrators.

## 3. Configure the browser

Open Supabase **Project Settings → API**.

Copy:
- Project URL
- anon/public key (called the publishable key in some Supabase interfaces)

Put them in `js/config.js`:

```js
window.ATTENDANCE_CONFIG = {
  SUPABASE_URL: "YOUR_PROJECT_URL",
  SUPABASE_ANON_KEY: "YOUR_PUBLIC_ANON_OR_PUBLISHABLE_KEY"
};
```

These two values are intended for browser use. Never put a service-role key in the frontend.

## 4. Add the first student

Sign in at `admin-login.html`, then click **Add student**.

Use IDs such as `STU001`, `STU002`, etc.

New students receive today's `Absent` record immediately. A successful student login changes today's record to `Present`. The unique `(student_id, date)` constraint prevents duplicates.

## 5. GitHub

Create a repository, for example `attendance-system`, and upload the complete project folder.

Do not commit database passwords, service-role keys, or other secrets.

## 6. Netlify

Create a new Netlify site from the GitHub repository.

Build command: leave empty.

Publish directory: `.`

The included `netlify.toml` also declares this configuration.

After deployment, open:
- `/index.html` for students
- `/admin-login.html` for administrators

## Security model

Students do not receive a Supabase Auth account. Their Student ID/password is checked inside a narrowly scoped database RPC. The stored student password is a bcrypt-style hash, not plaintext.

Admin actions require both:
1. an authenticated Supabase Auth session, and
2. a matching row in `admin_profiles`.

RLS blocks normal authenticated users from reading student/attendance tables. Admin mutations are performed through security-definer RPC functions that check `is_admin()`.

## Date handling

Attendance dates are generated in the database using `Asia/Kathmandu`, so the attendance day follows Nepal time rather than the browser's local timezone.

## Automatic absent records

This version creates an `Absent` record when a student is added and uses `finalize_attendance(date)` to fill missing records for any existing date.

If you require rows to be physically created for every calendar day even when nobody opens the site, schedule `finalize_attendance` from a trusted scheduled backend/cron. Netlify static hosting itself is not a database scheduler.

The admin dashboard calls an admin-only database function for the selected date. That function creates any missing Absent rows before returning the complete Present/Absent list, so the attendance table is complete for the date being viewed.

## Test checklist

### Student
- correct ID/password → Present
- wrong password → error, no attendance change
- unknown ID → error
- empty fields → validation error
- repeated same-day login → one attendance row
- login on another day → another attendance row

### Admin
- valid Auth account + admin profile → dashboard
- valid Auth account without admin profile → denied
- wrong password → denied
- add student → row created
- duplicate Student ID → rejected
- edit name → updated
- edit password → new password works
- delete → student and attendance removed
- attendance date filter → correct date shown

### Attendance
- new student → today's Absent row
- student login → Present
- repeated login → no duplicate
- multiple students → independent records
- different dates → independent records
- tables sorted by Student ID

## Known architecture limitation

Because this is a static Netlify frontend, it cannot itself execute a reliable midnight database job. The SQL function `finalize_attendance(date)` exists for that purpose, but an external scheduler or Supabase-supported scheduled mechanism must invoke it if you require automatic historical rows for every student every single day without anyone opening the site.

The security-sensitive work is in Supabase, not JavaScript/CSS.

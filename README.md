# Diagsync - Medical Diagnostic Operations System

A multi-role diagnostic workflow operating system for medical labs.

## Phase 1 Covers
- Organization registration
- Individual staff accounts with roles
- Role-based access control (RBAC)
- Authentication (NextAuth v5 + JWT)
- Role-specific dashboards (Receptionist, Lab Scientist, Radiographer, MD, HRM)
- Staff availability toggle
- Audit logging
- Middleware-based route protection

---

## Tech Stack
- **Framework:** Next.js 14 (App Router)
- **Database:** PostgreSQL
- **ORM:** Prisma
- **Auth:** NextAuth v5
- **UI:** Tailwind CSS + Radix UI
- **Validation:** Zod + React Hook Form

---

## Setup Instructions

### 1. Install dependencies
```bash
npm install
```

### 2. Set up environment variables
```bash
cp .env.example .env.local
```

Open `.env.local` and fill in:
```
DATABASE_URL="postgresql://username:password@localhost:5432/diag_ops"
AUTH_SECRET="generate-a-random-secret-here"
NEXTAUTH_URL="https://diagsync.vercel.app"
```

To generate a secure AUTH_SECRET:
```bash
openssl rand -base64 32
```

### 3. Set up PostgreSQL database
Make sure PostgreSQL is running, then create the database:
```bash
createdb diag_ops
```
Or via psql:
```sql
CREATE DATABASE diag_ops;
```

### 4. Push database schema
```bash
npx prisma db push
```

### 5. Generate Prisma client
```bash
npx prisma generate
```

### 6. Seed the database (creates first org + super admin)
```bash
npm run db:seed
```

Default login after seeding:
- **Email:** superadmin@reenemedical.com
- **Password:** Admin@1234

> WARNING: Change this password immediately after first login!

### 7. Start development server
```bash
npm run dev
```

Open [https://diagsync.vercel.app](https://diagsync.vercel.app)

---

## Roles & Dashboards

| Role | Dashboard Path | Can Do |
|------|---------------|--------|
| SUPER_ADMIN | /dashboard/hrm | Everything |
| HRM | /dashboard/hrm | Staff management, audit, operations |
| RECEPTIONIST | /dashboard/receptionist | Patient registration |
| LAB_SCIENTIST | /dashboard/lab-scientist | Lab tests, result entry |
| RADIOGRAPHER | /dashboard/radiographer | Imaging, radiology reports |
| MD | /dashboard/md | Review, approve, edit requests |

---

## Useful Commands

```bash
npm run dev          # Start dev server
npm run build        # Production build
npx prisma studio    # Open database GUI
npx prisma db push   # Push schema changes
npm run db:seed      # Re-seed the database
```

---

## Phase 2 Next
- Test database (lab tests + radiology tests)
- Result templates
- Pricing
- Patient model
- Visit model

## CI/CD and Staging

### Branch flow
- `feature/*` branches are for normal work.
- `staging` is your pre-production branch.
- `main` is your production branch.

### What GitHub Actions does
- Runs Prisma generate.
- Runs linting.
- Runs the production build.
- Runs every core test script in one pipeline.

### What Vercel does
- Preview deployments for pull requests and non-production branches.
- Production deployments from `main`.
- Staging deployments from `staging` if you connect that branch in Vercel.

### Database setup for your VPS-hosted Postgres
Because you host the database yourself, treat the database exactly like the app: separate environments, separate connection strings.
- Local/dev database: used on your laptop or dev server.
- Staging database: used only by the `staging` branch deployment.
- Production database: used only by the `main` branch deployment.

Recommended setup on the VPS:
- Create two Postgres databases, for example `diagsync_staging` and `diagsync_prod`.
- Prefer separate Postgres roles/users for staging and production.
- Keep `DIRECT_URL` and `DATABASE_URL` matching the same environment.
- Run `npm run db:deploy` after schema changes so Prisma applies the latest migrations.

### GitHub/Vercel env vars
Set the same variable names in each environment, but with different values:
- `DATABASE_URL`
- `DIRECT_URL`
- `AUTH_SECRET`
- `NEXTAUTH_URL`
- `NEXT_PUBLIC_APP_URL`

### Day-to-day use
1. Push work to a feature branch.
2. Open a pull request into `staging`.
3. Let GitHub Actions block bad code before merge.
4. Merge to `staging` for staging deploys.
5. After staging looks good, merge `staging` into `main`.
6. Production deploys from `main`.

### When you change the database schema
1. Update `prisma/schema.prisma`.
2. Create a migration.
3. Commit the migration.
4. Run `npm run db:deploy` on the target environment after deployment, or during your server release step if that is how you manage releases.




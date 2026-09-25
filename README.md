# Mandai Assessment

A small full-stack product management take-home: one customer storefront, one admin inventory dashboard, and one API
whose purchase flow is designed to prevent overselling.

Catalog pages, active-product APIs, and attached product images are public. Cart, checkout, and personal orders
require USER; administration requires ADMIN. Checkout prevents overselling and duplicate orders. No payment gateway is used.

## Features

### Storefront

- Register, sign in/out, search and browse products, inspect details, and add items to a persistent account cart.
- Edit cart quantities, resolve unavailable items before whole-cart checkout, checkout without payment, and view private order history.
- Clear price/stock conflict feedback, atomic multi-product orders, and safe retry after an uncertain response.

### Admin

- Protected inventory overview with product, price, stock, status, and actions.
- Create, view, edit and archive products in dialogs. Upload up to 8 images and select/reorder the cover.
- Separate stock-in/out adjustments with reasons, operator identity and history.
- Read-only product logs show field-level before/after values, including archived products.
- Paginated all-customer orders and read-only details show customer email, time, quantities, snapshots and SGD total. ADMIN cannot purchase.

### Backend and correctness

- Express API with Zod validation, bcrypt password hashes, JWT cookie authentication, and server-side `ADMIN` checks.
- One PostgreSQL transaction performs an atomic conditional stock decrement and creates the order and order item
  together.
- A database `CHECK (stock >= 0)` and a real PostgreSQL concurrency test provide defense and evidence.

Real PostgreSQL integration tests cover concurrent buyers, repeat requests, admin stock competition, and transactional rollback.

## Tech stack

| Area          | Choice                                                              |
|---------------|---------------------------------------------------------------------|
| Web           | Next.js App Router, TypeScript, Tailwind CSS                        |
| API           | Node.js, Express, TypeScript, Zod                                   |
| Data          | PostgreSQL, Prisma ORM, focused parameterized SQL                   |
| Auth          | JWT in an HttpOnly cookie, bcrypt, `ADMIN` and `USER` roles         |
| Tests         | Node test runner, Supertest, isolated real PostgreSQL databases |
| Local tooling | pnpm workspaces, Docker Compose                                     |

## Architecture

```text
Browser
  |
  v
Next.js storefront and admin dashboard
  | Same-origin /api proxy
  v
Express API
  | Prisma + parameterized conditional SQL
  v
PostgreSQL
```

The same Next.js app serves the store and admin pages. Express validates input and enforces roles before domain route handlers
reach PostgreSQL. [SPEC.md](./SPEC.md) defines required behavior and acceptance
criteria; [ARCHITECTURE.md](./ARCHITECTURE.md) explains the database model, transaction design, and trade-offs.

## Getting started

### Requirements

- Node.js 20.19.x or later 20.x, 22.12.x or later 22.x, or 24.0+ (installed Prisma requires `^20.19 || ^22.12 || >=24.0`)
- pnpm (Corepack is fine)
- Docker with Compose

### Run locally

```bash
git clone https://github.com/jieshenghow/mandai.git mandai-assessment
cd mandai-assessment
cp .env.example .env
docker compose up -d --wait
pnpm install
pnpm db:deploy
pnpm db:generate
pnpm db:seed
pnpm db:seed:products
pnpm dev
```

Open `http://localhost:3000/login` and sign in as **`admin@example.com`** with password **`DemoPass123!`**
to access the admin dashboard. See [Demo accounts](#demo-accounts) for both roles. `pnpm db:seed` creates accounts;
`pnpm db:seed:products` imports the 30 sample products and 150 images from `test-products/`.
You can also create and edit products as an administrator at `/admin/products`.
`http://localhost:4000/api/health` checks Express
directly; `http://localhost:3000/api/health` checks the Next.js proxy to Express. The root `pnpm dev` script starts both
workspace apps. If port 5432 is occupied, change the Compose host port and the `DATABASE_URL` in `.env` together.

The API uses `tsx` to run TypeScript. The web application uses the Next.js App Router, TypeScript, Tailwind CSS,
and ESLint. One root pnpm lockfile manages both applications.

### Database migrations

The initial [Prisma schema](./prisma/schema.prisma)
and [SQL migration](./prisma/migrations/20260925040959_init/migration.sql) create `tbl_user`, `tbl_product`,
`tbl_order`, and `tbl_order_item`. The SQL migration includes `CHECK (stock >= 0)` and the documented price, stock,
quantity, and total bounds. `pnpm db:migrate` applies pending migrations to the local development database. Prisma 7
requires `pnpm db:generate` separately after schema changes. Use `pnpm db:status` to check migration state; use
`pnpm db:deploy` to apply checked-in migrations in deployment
environments. [Prisma's development migration guide](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/development-and-production)
describes the distinction.

To add another table:

```bash
# 1. Add a model to prisma/schema.prisma with @@map("tbl_example")
#    and @map("snake_case_column") for fields whose names differ.
# 2. Generate SQL without applying it, so database checks can be reviewed.
pnpm exec prisma migrate dev --create-only --name add_example
# 3. Review and, if needed, edit the new prisma/migrations/*/migration.sql.
pnpm db:migrate
pnpm db:generate
pnpm db:status
```

The Prisma model name remains singular PascalCase, such as `Example`, while `@@map("tbl_example")` sets its actual
PostgreSQL table name. `@map` does the same for a column. Do not use `prisma db push` here: it bypasses the checked-in
SQL checks. Run `pnpm db:seed` to create development demo accounts. Existing accounts are left unchanged.

## Environment variables

Copy [.env.example](./.env.example) to `.env`. `DATABASE_URL` connects the Prisma CLI to the local database and connects
the API. `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB` configure Compose. `API_PORT` sets Express's port.
`JWT_SECRET` signs authentication tokens. `WEB_ORIGIN` is present in `.env.example` but is currently unused;
browser requests use the same-origin Next.js proxy, and no configurable CORS allowlist is implemented. The proxy targets
port 4000 by default; if the API port changes, set `API_PROXY_TARGET` in the web process environment. Replace the sample
JWT secret before deployment. `.env` is ignored by Git; the checked-in values are local development examples only.

## Demo accounts

Run `pnpm db:seed` after applying migrations to create these local development accounts:

| Role | Email | Password | Access |
| --- | --- | --- | --- |
| Admin | `admin@example.com` | `DemoPass123!` | `/admin` dashboard, product management, stock adjustments, and all orders |
| Customer | `user@example.com` | `DemoPass123!` | Storefront, cart, checkout, and personal order history |

Sign in at `http://localhost:3000/login`. Admin accounts manage inventory; use the customer account to test purchases.
Public registration creates only `USER` accounts. Re-running the seed does not reset existing passwords or roles.
These credentials are for local development only.

### Demo products

Run `pnpm db:seed:products` after seeding accounts to import [test-products/products.json](./test-products/products.json).
The script runs directly against PostgreSQL without requiring a running API. It copies and converts local photos to
WebP, selects the first image as the cover, and records initial inventory and creation history for each product.
Stable product keys make reruns safe: existing products, including archived ones, are skipped without resetting stock
or overwriting edits. See [test-products/README.md](./test-products/README.md) for the manifest format and import behavior.

## Authentication and route groups

The `(auth)` group contains the shared `/login` and `/register` pages. `(app)` contains `/`; `(admin)` contains
`/admin`. Parenthesized directories do not change URLs or enforce permissions themselves.

`apps/web/proxy.ts` is the Next.js 16 name for Middleware. It applies the rules in `lib/route-access.ts` before
rendering all page requests: catalog `/` and `/products/[id]` are public; other business pages require login by default; `/admin` and descendants additionally require
`ADMIN`. Signed-in users visiting login/register return to their role’s home page. Unknown paths require authentication
and then show the themed 404. Static framework assets and `/api` are excluded. Put additional public static assets in an
explicitly excluded path; never exclude arbitrary file extensions because business URLs may contain dots.

The proxy verifies sessions with Express `/api/auth/me`, forwards the session cookie, and does not cache identity
responses. Service failures return 503 instead of granting access. USER is redirected from admin pages to `/`;
unauthenticated users on private pages go to `/login`. ADMIN cannot enter customer cart/order pages and is redirected to `/admin`. API requests receive JSON 401/403 errors instead of redirects. Private API routers are mounted below authentication and role guards; only catalog reads and authorized image reads precede authentication.

JWT sessions last one hour in an HttpOnly, SameSite=Strict cookie with `Path=/` and Secure in production. The API looks
up the current database user/role for each protected request. Logout clears the cookie; copied tokens are not revoked
before expiry. Set a random `JWT_SECRET` of at least 32 characters before running outside a local demo. Passwords use
bcrypt. No token is stored in localStorage.

## Web routes

| Web route              | Purpose                             |
|------------------------|-------------------------------------|
| `/`                    | Product storefront                  |
| `/products/[id]`       | Product details and add to cart     |
| `/cart`                 | Persistent cart and checkout         |
| `/orders`               | Paginated order history              |
| `/orders/[id]`          | Order receipt and purchase snapshots |
| `/login`, `/register`  | Authentication                      |
| `/admin`               | Inventory summary                   |
| `/admin/products`      | Table-oriented inventory management |
| `/admin/orders`        | All-customer order history |
| `/admin/orders/[id]`   | Read-only order detail with customer email |
| `/admin/product-logs`   | Filtered product and purchase logs   |

`Workspace` provides shared navigation and account state. Screens reuse `ProductForm` and the `Modal`,
`ModalCancel`, `Feedback`, and `Status` components. The storefront, inventory, cart, and orders live in their
respective screen components. Stock labels derive **In Stock**, **Low Stock**, and **Sold Out** from current stock.

## API overview

| Method | Endpoint                  | Access                 |
|--------|---------------------------|------------------------|
| POST   | `/api/auth/register`      | Public; creates `USER` |
| POST   | `/api/auth/login`         | Public                 |
| POST   | `/api/auth/logout`        | Any session state      |
| GET    | `/api/auth/me`            | Authenticated          |
| GET    | `/api/products`           | Public          |
| GET    | `/api/products/:id`       | Public          |
| GET    | `/api/admin/products`     | `ADMIN`                |
| GET    | `/api/admin/products/:id` | `ADMIN`                |
| POST   | `/api/admin/products`     | `ADMIN`                |
| PATCH  | `/api/admin/products/:id` | `ADMIN`                |
| DELETE | `/api/admin/products/:id` | `ADMIN`; soft delete   |
| GET    | `/api/cart`                 | `USER`; own cart |
| POST   | `/api/cart/items`           | `USER`; add quantity |
| PATCH  | `/api/cart/items/:id`       | `USER`; set quantity |
| DELETE | `/api/cart/items/:id`       | `USER`; remove item |
| POST   | `/api/checkout`             | `USER`; atomic purchase |
| GET    | `/api/orders`               | `USER`; own orders, 20/page |
| GET    | `/api/orders/:id`           | `USER`; own order |
| GET    | `/api/admin/orders`         | `ADMIN`; all orders, 20/page |
| GET    | `/api/admin/orders/:id`     | `ADMIN`; order with customer email |

Admin order lists return `{data: {items,total,page,pageSize}}`, sorted by creation time then ID descending.
Order details return `{data: receipt}`. Admin receipts include `customerEmail` and omit request hashes.
USER receives 403; guests receive 401; missing order details return 404. There are no order mutation endpoints.

Cart writes include `version`. Add accepts `{productId, quantity, version}`, PATCH accepts `{quantity, version}`,
and DELETE accepts `{version}`. One cart supports 100 different products, each with quantity 1–100.
Checkout accepts `{requestId, version, items:[{productId, quantity, priceCents}]}`. Prices are SGD integer cents;
the server verifies displayed prices and computes the total from locked database rows (maximum 1,000,000,000 cents).
First success returns `201`; replaying the same user/requestId and payload returns `200` with the original order.
Reusing a requestId for different contents returns `409 REQUEST_REUSED`.

Unavailable cart entries remain in the cart and displayed total and block the entire checkout. The customer must explicitly remove them or reduce quantities. The server rejects subsets of the cart.
If a submitted product becomes unavailable or changes price, the whole request rolls back with `409`; the UI refreshes
and asks the user to review before another checkout. Success removes only purchased items and opens the order receipt.
Orders store name and price snapshots. USER reads only their own orders; ADMIN reads all orders through separate protected read-only endpoints.

## Inventory concurrency

Checkout locks the user's cart, checks idempotency and cart version, then locks product rows in sorted UUID order.
It validates current stock, active state and displayed price, and performs a conditional decrement:
`UPDATE tbl_product SET stock = stock - $2, stock_version = stock_version + 1 WHERE id = $1 AND stock >= $2 ...`.
Order, items, stock movements, PURCHASE logs and cart cleanup commit together. Any failure rolls everything back.
Admin stock adjustments use the same product row locks. No in-process mutex, Redis or queue is needed.

With stock 1 and two simultaneous quantity-1 purchases, one succeeds, one receives 409, final stock is 0,
and only one order is created. A unique `(user_id, request_id)` order index plus cart serialization prevents
repeated submissions from decrementing stock twice. The browser retains unresolved checkout requests in per-user
sessionStorage so a reload/retry in the same tab can retrieve the original result. Authentication/authorization
failures preserve that request: sign in with the original USER account, return to the cart in the same tab and retry.
The client checks account identity before submitting; successful responses and explicit checkout validation/conflict
responses resolve the pending request. Account lookup failures display a retry control and do not establish a guest session.

## Testing

`pnpm test` runs frontend tests and Node test runner / Supertest against uniquely named disposable PostgreSQL databases.
Use a local or dedicated test PostgreSQL instance for `DATABASE_URL`. API suites connect to that control database,
create separate `mandai_{auth,products,commerce}_test_<pid>_<timestamp>` databases, apply migrations there, and drop
those databases with `DROP DATABASE ... WITH (FORCE)` afterward. Tests do not modify development records.
The `DATABASE_URL` user needs CREATE DATABASE permission. Coverage includes authentication,
admin CRUD/uploads/audit, cart isolation and stale edits, order ownership/snapshots, last-unit competition, 12 concurrent
buyers competing for 3 units, reverse-order multi-item carts, duplicate checkouts, purchase versus admin stock-out,
and forced order/item/movement/log failures with complete rollback.

Run `pnpm typecheck`, `pnpm lint`, and `pnpm --filter @mandai/web build` for static/build verification.
The [recorded verification](./ARCHITECTURE.md#14-recorded-verification-2026-09-26) passed 22 API tests,
6 frontend tests, type checking, lint, and the production build.

Manual browser acceptance: sign in, search/open a product, add and edit items, verify unavailable items are greyed out,
checkout, inspect history, and check keyboard access and mobile widths. A browser connection is needed for visual checks.

## Project structure

```text
mandai-assessment/
├── apps/
│   ├── web/              # Next.js storefront, cart, orders and admin
│   └── api/              # Express API with TypeScript
├── test-products/        # demo catalog manifest and source images
├── prisma/               # schema and checked-in SQL migrations
├── prisma7.config.ts
├── DESIGN.md
├── SPEC.md
├── ARCHITECTURE.md
├── README.md
├── docker-compose.yml
├── pnpm-workspace.yaml
└── .env.example
```

## Design

[DESIGN.md](./DESIGN.md) describes the shared visual styling: warm light surfaces, dark green accents,
subtle borders, readable inventory tables, and explicit stock labels. The UI uses a system font fallback and shared
CSS and Tailwind tokens.

## Trade-offs and scope

This is a modular monolith with one relational database. Prisma handles standard data access; parameterized SQL
expresses the inventory-critical update. Soft deletion preserves order history. Checkout uses idempotency keys. Token revocation, rate limiting, inventory reservations, and payment are outside the current scope. Testing details are in [ARCHITECTURE.md](./ARCHITECTURE.md#12-testing-strategy). The project repository
is [jieshenghow/mandai](https://github.com/jieshenghow/mandai).

## Frontend POST requests

The root layout installs a client-side `QueryProvider` from TanStack Query. Login, registration, and logout use
`useMutation`; the shared `postApi<T>()` helper sends JSON with the existing HttpOnly cookie and throws API errors for
the form to display. Mutations do not automatically retry. Logout clears the query cache before navigating back to
login.

For a new POST action, call `postApi<Result>("/api/your-endpoint", input)` from a `useMutation` mutation function, use
`isPending` to disable duplicate submission, and show `error.message` on failure. When a mutation changes cached
product data, invalidate the corresponding query key in `onSuccess`. The server route guard continues to use server-side
fetch.

## Product management

Sign in as an administrator and open `/admin/products`. Use **Add product**, **View**, **Edit**, **Stock in**,
**Stock out**, or **Delete**. Delete archives the product; it does not erase orders or history. Initial stock is
entered during creation. Later changes use positive adjustment quantities and a required reason, never an absolute
stock overwrite. The API locks the product row and writes inventory, movement and change log in one transaction.

`/admin/product-logs` shows successful product changes only: creation, edits, images/cover/order, stock adjustments and
archiving and purchase deductions. Filter by product name, operator email, action and date; pages contain 20 records. Product details also
include this history. Operator identity comes from the authenticated server session. Failed actions, browsing,
login/logout and abandoned uploads are not logged. Logs have no mutation endpoint. Snapshots retain operator email
and product name; image changes retain image IDs rather than permanent copies of removed image bytes.

### Local image storage

Uploads are written to `<repository>/uploads` by default. Set `UPLOAD_DIR` to an absolute writable directory to override.
In deployment, mount this directory on persistent storage and back it up together with PostgreSQL. Multiple API
instances must share that directory. Uploaded files are excluded from Git; they are not stored in Next.js `public`.

Each product supports 0–8 images, up to 5 MB per input file, in JPG/PNG/WebP format. Animated files and images over
40 megapixels are rejected. The API decodes and re-encodes images as WebP, stripping metadata. Images are read via
the product-image API: images attached to active products are public; unattached previews require their uploading ADMIN session.
For unattached previews, other authenticated accounts receive 404 and guests receive 401. Archived-product images return
404. Image responses use `Cache-Control: private, no-store`. Unattached uploads and removed
images expire after 24 hours and are cleaned on API startup and hourly. Archived product images remain stored.
After interrupted uploads, orphan file cleanup runs on the same schedule. No cloud account is required.

### Inventory API contracts

All admin endpoints require `ADMIN`. JSON responses retain `{data}` / `{error,message,details?}` envelopes.

| Method | Endpoint | Input / behavior |
|---|---|---|
| GET | `/api/products`, `/api/products/:id` | Public active product reads; omit stock version |
| GET/POST | `/api/admin/products` | List / create; create accepts name, description, priceCents, stock, imageIds, coverImageId |
| GET/PATCH/DELETE | `/api/admin/products/:id` | Read / edit metadata and image selection / archive; PATCH rejects stock |
| POST | `/api/admin/product-images` | Multipart field `image`, one file; returns id and a URL private until attached |
| GET | `/api/product-images/:id` | Public active-product images; uploading ADMIN only for unattached previews |
| GET/POST | `/api/admin/products/:id/stock-movements` | History / `{type:"IN" or "OUT", quantity, reason}` |
| GET | `/api/admin/product-logs` | Optional productId, product (name), actor (email), action, from/to (ISO timestamp), page |

An image must belong to the product or be an unattached upload owned by the current administrator. Omit imageIds
on PATCH to preserve the gallery. When supplied, imageIds is the complete ordered selection; removing the current
cover chooses the first remaining image. Empty galleries have a null cover. Stock adjustments return `409 STOCK_LIMIT`
when inventory would leave 0–1,000,000. Successful adjustments and purchases increment stockVersion. Purchases append stock movements and PURCHASE product logs.

See [Testing](#testing) for integration coverage, database requirements, and manual browser acceptance.

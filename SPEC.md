# Product Specification

> **Status:** Planned behavior and acceptance criteria. The web/API scaffolds and initial database tables exist, but the
> product features are not implemented yet.

This document defines **what Mandai Assessment must do** and how to tell whether it is
complete. [ARCHITECTURE.md](./ARCHITECTURE.md) explains **how** the system will meet these
requirements. [DESIGN.md](./DESIGN.md) governs visual styling.

## 1. Goal and scope

Build a small product storefront and an admin inventory dashboard in one Next.js application, backed by an Express API
and PostgreSQL. The essential result is a purchase flow that cannot oversell stock, even when requests arrive
concurrently.

The required scope is registration/login/logout, product browsing, admin product CRUD, single-product quantity purchase,
role enforcement, durable orders, and clear success/error feedback. An order-history page is optional and outside the
completion criteria.

## 2. Users and permissions

| Capability                        | Unauthenticated | `USER` | `ADMIN` |
|-----------------------------------|-----------------|--------|---------|
| Browse active products and stock  | No              | Yes    | Yes     |
| Register a `USER` account         | Yes             | Yes    | Yes     |
| Login and logout                  | Yes             | Yes    | Yes     |
| Buy an active product             | No              | Yes    | Yes     |
| View admin inventory              | No              | No     | Yes     |
| Create, edit, or archive products | No              | No     | Yes     |

Registration must never accept or assign an `ADMIN` role. Only the development seed or a trusted administrative process
may create an admin account. Every admin API route must check the role on the server, regardless of what the frontend
displays.

## 3. User flows and acceptance criteria

### 3.1 Account access

1. An unauthenticated user submits a valid email and password and receives a `USER` account and authenticated session.
2. A user can log in with valid credentials and log out. Failed login uses a generic credentials error.
3. Refreshing the browser retains the session until its token expires or the user logs out.
4. A request without a valid session to a protected API route returns `401`. A `USER` request to an admin route returns
   `403`.

### 3.2 Storefront and product detail

1. The storefront lists active products with name, SGD price, and current availability.
2. A product detail page shows name, description, price, stock, quantity control, and purchase action.
3. A missing or archived product receives a useful not-found state and API `404`.
4. Stock status is derived from stock: `0` = **Sold Out**, `1–5` = **Low Stock**, `6+` = **In Stock**. The label is not
   persisted.
5. The browser may disable purchase controls for sold-out stock, but the API decides whether a purchase succeeds.
   Displayed stock may be stale.

### 3.3 Purchase

1. An authenticated buyer sends a positive integer quantity from 1 to 100 for one product.
2. If enough stock exists, the API returns `201` with an order receipt. The database stores exactly one order and one
   order item for that purchase, decrements stock once, and records the unit price at purchase time.
3. If stock is insufficient, the API returns `409 INSUFFICIENT_STOCK`, creates no order, and leaves stock unchanged.
4. If the product does not exist or is archived, the API returns `404 PRODUCT_NOT_FOUND` and creates no order.
5. If any order write fails after the stock update, the whole operation rolls back, including the decrement.
6. Stock is never negative. For stock `1` and two simultaneous quantity-`1` requests, exactly one succeeds and one
   receives `409`; final stock is `0` and exactly one order exists.
7. The UI shows a clear success receipt or a clear failure message and refreshes displayed availability after the
   response.

### 3.4 Admin inventory

1. An admin can view an inventory table with product, price, current stock, derived status, and actions.
2. An admin can create a product, edit its fields, change stock through the product edit form, and archive it.
3. Archiving removes a product from public and active admin lists and prevents later purchases. Existing order items
   remain valid.
4. A stock edit based on a stale `stockVersion` returns `409 PRODUCT_CHANGED`. The UI prompts the admin to reload
   current data rather than silently replacing a purchase decrement or another stock edit.
5. Product changes, including stock changes, must be validated and authorized by the API.

## 4. Planned pages

| Route                  | Required content                                              |
|------------------------|---------------------------------------------------------------|
| `/`                    | Active product grid, availability, navigation to details      |
| `/products/[id]`       | Product detail, quantity selector, purchase result            |
| `/login`               | Login form and authentication feedback                        |
| `/register`            | Registration form and validation feedback                     |
| `/admin`               | Inventory summary and path to product management              |
| `/admin/products`      | Table-oriented inventory list and create/edit/archive actions |
| `/admin/products/new`  | Product creation form                                         |
| `/admin/products/[id]` | Product edit form with current stock version                  |

The web app should share layout and form/table primitives rather than duplicate page styling.
Follow [DESIGN.md](./DESIGN.md) for colors, spacing, type, surfaces, focus states, and responsive behavior. The admin
table must preserve essential columns on small screens, including by horizontal scrolling if needed.

## 5. Data and validation contract

All IDs are UUIDs. API JSON and Prisma fields use camelCase. Physical PostgreSQL tables are `tbl_user`, `tbl_product`,
`tbl_order`, and `tbl_order_item`; their columns use snake_case. Prices are **SGD integer cents**; the API never accepts
a floating-point currency amount. The initial catalog is small and list endpoints do not require pagination.

| Data                       | Required validation or invariant                                            |
|----------------------------|-----------------------------------------------------------------------------|
| `User.email`               | Valid email; trim and normalize to lowercase; unique in the database.       |
| `User.password`            | 8–72 UTF-8 bytes at registration; never stored as plaintext.                |
| `User.role`                | `USER` or `ADMIN`; public registration always creates `USER`.               |
| `Product.name`             | Trimmed, 1–120 characters.                                                  |
| `Product.description`      | String, at most 2,000 characters; empty string allowed.                     |
| `Product.priceCents`       | Integer from 1 to 10,000,000.                                               |
| `Product.stock`            | Integer from 0 to 1,000,000. PostgreSQL must enforce at least `stock >= 0`. |
| `Product.stockVersion`     | Nonnegative integer used to reject stale admin stock edits.                 |
| Purchase `quantity`        | Integer from 1 to 100.                                                      |
| `Order.totalAmountCents`   | Purchase-time `unitPriceCents × quantity`; positive integer.                |
| `OrderItem.unitPriceCents` | Snapshot of the product price returned by the successful inventory update.  |

The [Prisma schema](./prisma/schema.prisma) persists `User`, `Product`, `Order`, and `OrderItem` with the relationships
described in [ARCHITECTURE.md](./ARCHITECTURE.md#4-database-schema). Product archive state is `deletedAt`, not a
separate inventory status. The initial migration includes a nonnegative-stock check; the future API must reject invalid
input before querying where possible.

## 6. API contract

Success responses use `{ "data": ... }`; errors use `{ "error": "MACHINE_CODE", "message": "Human-readable message." }`
with optional safe validation details. Route parameters and request bodies are validated server-side.

| Method | Endpoint                  | Access        | Request                                                                             | Success                                     |
|--------|---------------------------|---------------|-------------------------------------------------------------------------------------|---------------------------------------------|
| POST   | `/api/auth/register`      | Public        | `{email, password}`                                                                 | `201`, user summary and auth cookie         |
| POST   | `/api/auth/login`         | Public        | `{email, password}`                                                                 | `200`, user summary and auth cookie         |
| POST   | `/api/auth/logout`        | Any           | Empty                                                                               | `200`, cookie cleared                       |
| GET    | `/api/auth/me`            | Authenticated | —                                                                                   | `200`, user summary                         |
| GET    | `/api/products`           | Authenticated | —                                                                                   | `200`, active products                      |
| GET    | `/api/products/:id`       | Authenticated | —                                                                                   | `200`, active product                       |
| GET    | `/api/admin/products`     | `ADMIN`       | —                                                                                   | `200`, active inventory with `stockVersion` |
| GET    | `/api/admin/products/:id` | `ADMIN`       | —                                                                                   | `200`, product with `stockVersion`          |
| POST   | `/api/admin/products`     | `ADMIN`       | `{name, description, priceCents, stock}`                                            | `201`, created product                      |
| PATCH  | `/api/admin/products/:id` | `ADMIN`       | One or more product fields; `expectedStockVersion` required when `stock` is present | `200`, updated product                      |
| DELETE | `/api/admin/products/:id` | `ADMIN`       | —                                                                                   | `200`, archived product summary             |
| POST   | `/api/products/:id/buy`   | Authenticated | `{quantity}`                                                                        | `201`, order receipt                        |

Order receipt data includes `id`, `totalAmountCents`, and one item with `productId`, `quantity`, and `unitPriceCents`.
Public product responses omit `stockVersion`; admin product responses include it.

Expected failure statuses: `400` for validation, `401` for missing/invalid authentication or failed login, `403` for
insufficient role, `404` for absent/archived products, `409` for insufficient stock, duplicate email, or stale admin
stock edit. Unexpected failures return `500` without internal details. Insufficient stock specifically returns:

```json
{ "error": "INSUFFICIENT_STOCK", "message": "Not enough inventory available." }
```

The API route list and the exact database/concurrency design are also documented
in [ARCHITECTURE.md](./ARCHITECTURE.md#5-api-architecture-and-contracts).

## 7. Completion and test evidence

The assignment is complete when:

- The storefront and admin pages above work in one Next.js application.
- The Express API performs the listed operations with Zod validation, bcrypt password hashes, JWT authentication, and
  server-side roles.
- A checked-in PostgreSQL migration creates the schema and the `stock >= 0` constraint.
- Product CRUD and one-product purchases work, including archive behavior and purchase-time price history.
- Authentication, authorization, validation, CRUD, purchase success/failure, and stale admin stock edit have meaningful
  tests.
- A **real PostgreSQL** Supertest concurrency test proves the last-item scenario: one `201`, one `409`, stock `0`, one
  order and item. The transaction is not mocked.
- The README's setup/test commands work in a suitable environment, `.env.example` lists required variables, and a GitHub
  repository is ready for submission.

## 8. Deliberate exclusions

No cart, payment gateway, shipping, coupons, categories, Redis, Kafka, queues, microservices, event sourcing, CQRS, or
Kubernetes. Search, pagination, order history, idempotency keys, rate limiting, refresh token rotation, and deployment
automation are optional future work. Do not expand scope until the required flows and concurrency test are complete.

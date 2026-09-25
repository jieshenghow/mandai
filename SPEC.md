# Product Specification

> **Status:** Authentication, admin management, storefront, persistent carts, safe checkout and order history are implemented.

This document defines **what Mandai Assessment must do** and how to tell whether it is
complete. [ARCHITECTURE.md](./ARCHITECTURE.md) explains **how** the system will meet these
requirements. [DESIGN.md](./DESIGN.md) governs visual styling.

## 1. Goal and scope

Build a small product storefront and an admin inventory dashboard in one Next.js application, backed by an Express API
and PostgreSQL. The essential result is a purchase flow that cannot oversell stock, even when requests arrive
concurrently.

The required scope is registration/login/logout, product browsing, admin product CRUD, database-backed carts,
role enforcement, atomic multi-product orders, order history, and clear success/error feedback.

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
2. A product detail page shows name, description, price, stock, quantity control, and add-to-cart action.
3. A missing or archived product receives a useful not-found state and API `404`.
4. Stock status is derived from stock: `0` = **Sold Out**, `1–5` = **Low Stock**, `6+` = **In Stock**. The label is not
   persisted.
5. The browser may disable purchase controls for sold-out stock, but the API decides whether a purchase succeeds.
   Displayed stock may be stale.

### 3.3 Cart, checkout and orders

1. Each account has a persistent cart, visible across devices. Items have quantities 1–100; the cart allows 100 distinct products.
2. Adding to cart does not reserve or decrement stock. Writes use cart versions to reject stale multi-tab/device changes.
3. Missing stock, archived products and quantities above stock are greyed out with a reason. They remain editable/removable
   as appropriate and are excluded from the submitted checkout and total. If nothing is available, checkout is disabled.
4. Checkout submits a nonempty list of currently displayed available items, quantities, displayed prices, cart version and
   a UUID requestId. The API checks ownership, cart contents and current locked products, then calculates the total itself.
5. New success returns 201; replay of the same user/requestId and payload returns 200 with the original order. Reuse with
   different contents returns 409. Pending UI submissions are disabled; uncertain responses retain the exact request for retry.
6. A submitted item becoming unavailable, insufficient or differently priced returns 409 and rolls back the entire submitted
   order. The UI refreshes and the user reviews before resubmitting. The server does not silently reduce quantities or skip more items.
7. Order, name/price snapshots, stock changes, inventory movements, PURCHASE logs and cart cleanup commit together. Failures
   leave all of them unchanged. Only purchased cart items are removed; stockVersion and cart version increment on success.
8. With stock 1 and two competing buyers, exactly one succeeds, one receives 409, final stock is 0, and one order exists.
9. Receipt and order history show purchase-time names/prices. History is owner-only, newest first, 20 orders per page.
10. Storefront and cart refresh on mount, focus and mutations; no reservation or realtime push is required.

### 3.4 Admin inventory

1. An admin can view an inventory table with product, price, current stock, derived status, and actions.
2. An admin can create a product, edit its fields, adjust stock through separate stock-in/out dialogs, and archive it.
3. Archiving removes a product from public and active admin lists and prevents later purchases. Existing order items
   remain valid.
4. Stock adjustments apply a positive quantity and IN/OUT direction to the current locked row, never overwrite an
   absolute stock count. Out-of-bounds adjustments return `409 STOCK_LIMIT`. Successful changes increment `stockVersion`.
5. Product changes, including stock changes, must be validated and authorized by the API.

## 4. Pages

| Route                  | Required content                                              |
|------------------------|---------------------------------------------------------------|
| `/`                    | Active product grid, availability, navigation to details      |
| `/products/[id]`       | Product detail, quantity selector, add to cart                 |
| `/cart`                 | Persistent cart, availability and checkout                      |
| `/orders`               | Private paginated order history                                |
| `/orders/[id]`          | Private order receipt                                           |
| `/login`               | Login form and authentication feedback                        |
| `/register`            | Registration form and validation feedback                     |
| `/admin`               | Inventory summary and path to product management              |
| `/admin/products`      | Table-oriented inventory list and create/edit/archive actions |
| `/admin/product-logs` | Filtered, paginated read-only product change history           |

Create, view and edit forms are dialogs on `/admin/products`, not separate routes.

The web app should share layout and form/table primitives rather than duplicate page styling.
Follow [DESIGN.md](./DESIGN.md) for colors, spacing, type, surfaces, focus states, and responsive behavior. The admin
table must preserve essential columns on small screens, including by horizontal scrolling if needed.

## 5. Data and validation contract

All IDs are UUIDs. API JSON and Prisma fields use camelCase. Physical PostgreSQL tables are `tbl_user`, `tbl_product`,
`tbl_order`, `tbl_order_item`, `tbl_cart`, and `tbl_cart_item`, plus image and audit tables; their columns use snake_case. Prices are **SGD integer cents**; the API never accepts
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
| `Product.stockVersion`     | Nonnegative counter incremented on stock adjustments and purchases.                 |
| Purchase `quantity`        | Integer from 1 to 100.                                                      |
| `Order.totalAmountCents`   | Sum of purchase-time line totals; 1–1,000,000,000 cents.                |
| `OrderItem.unitPriceCents` | Snapshot of the locked product price at checkout.  |

The [Prisma schema](./prisma/schema.prisma) persists users, products, carts, orders, images and audit records with the relationships
described in [ARCHITECTURE.md](./ARCHITECTURE.md#4-database-schema). Product archive state is `deletedAt`, not a
separate inventory status. The initial migration includes a nonnegative-stock check; the API rejects invalid
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
| POST   | `/api/admin/products`     | `ADMIN`       | `{name, description, priceCents, stock, imageIds?, coverImageId?}`                                            | `201`, created product                      |
| PATCH  | `/api/admin/products/:id` | `ADMIN`       | Metadata/image selection only; stock is adjusted through the stock-movements endpoint | `200`, updated product                      |
| DELETE | `/api/admin/products/:id` | `ADMIN`       | —                                                                                   | `200`, archived product summary             |
| GET | `/api/cart` | Authenticated | — | Own cart with version and availability |
| POST | `/api/cart/items` | Authenticated | `{productId,quantity,version}` | `201`, updated cart |
| PATCH | `/api/cart/items/:id` | Authenticated | `{quantity,version}` | `200`, updated cart |
| DELETE | `/api/cart/items/:id` | Authenticated | `{version}` | `200`, updated cart |
| POST | `/api/checkout` | Authenticated | `{requestId,version,items:[{productId,quantity,priceCents}]}` | `201` new / `200` replayed receipt |
| GET | `/api/orders` | Authenticated | `?page=1` | Own orders, 20/page |
| GET | `/api/orders/:id` | Authenticated | — | Own order; `404` otherwise |

Order receipt data includes `id`, `totalAmountCents`, and items with `productId`, `productName`, `quantity`, and `unitPriceCents`.
Public product responses omit `stockVersion`; admin product responses include it.

Expected failure statuses: `400` for validation, `401` for missing/invalid authentication or failed login, `403` for
insufficient role, `404` for absent/archived products, `409` for insufficient stock, duplicate email, price changes, unavailable products, or a stale cart version. Unexpected failures return `500` without internal details. Insufficient stock specifically returns:

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
- Product CRUD and multi-product purchases work, including archive behavior and purchase-time price history.
- Authentication, authorization, validation, CRUD, purchase success/failure, repeat requests, and stale cart edits have meaningful
  tests.
- A **real PostgreSQL** Supertest concurrency test proves the last-item scenario: one `201`, one `409`, stock `0`, one
  order and item. The transaction is not mocked.
- The README's setup/test commands work in a suitable environment, `.env.example` lists required variables, and a GitHub
  repository is ready for submission.

## 8. Deliberate exclusions

No payment gateway, shipping, refunds, coupons, categories, Redis, Kafka, queues, microservices, event sourcing,
CQRS or Kubernetes. Catalog pagination, rate limiting, refresh token rotation and deployment automation remain future work.

## Implemented admin extensions

The API contracts, image storage rules and operator log behavior in [README.md](./README.md#product-management) are
part of this specification. Each product has 0–8 local images with an explicit cover. Stock-in/out requires quantity
and reason and produces an immutable application-level movement record. Product changes append actor/time/target and
before/after values transactionally; no-op edits, failed requests and account/view actions are excluded. Archived
products remain visible through the global product log. Stock adjustments and purchases both lock product rows and increment stockVersion. Purchases add PURCHASE logs
with the order ID and stock before/after values. Failed purchases do not leave audit or movement records.

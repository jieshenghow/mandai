# Mandai Assessment Design System

This is the visual source of truth for the storefront and admin dashboard. It adapts the principles and selected tokens
from [VoltAgent's Linear design analysis](https://github.com/VoltAgent/awesome-design-md/blob/main/design-md/linear.app/DESIGN.md)
to an inventory application. The reference describes a marketing site; this document specifies our product UI. Do not
copy Linear's page layouts, logo, or proprietary fonts.

## Direction

- A restrained dark interface with clear hierarchy and little decorative noise.
- Dense, readable inventory tables for admin work; quieter cards for the storefront.
- A single lavender accent for primary actions, links, and keyboard focus.
- Surface changes and hairline borders express depth. Avoid gradients and heavy shadows.
- Status is communicated with text and shape as well as color.

## Tokens

Implement these as CSS custom properties and Tailwind theme values in `apps/web` during the frontend phase. These values
take precedence over default styling from any component package.

| Token           | Value     | Use                              |
|-----------------|-----------|----------------------------------|
| `canvas`        | `#010102` | Page background                  |
| `surface-1`     | `#0f1011` | Cards, table containers, sidebar |
| `surface-2`     | `#141516` | Hovered rows, raised controls    |
| `surface-3`     | `#18191a` | Menus and nested surfaces        |
| `border`        | `#23252a` | Dividers and card outlines       |
| `border-strong` | `#34343a` | Control outlines                 |
| `text`          | `#f7f8f8` | Main content                     |
| `text-muted`    | `#d0d6e0` | Supporting content               |
| `text-subtle`   | `#8a8f98` | Metadata and placeholders        |
| `accent`        | `#5e6ad2` | Primary actions                  |
| `accent-hover`  | `#828fff` | Primary action hover             |
| `focus`         | `#5e69d1` | Visible focus outline            |

Use semantic status colors sparingly: green for **In Stock**, amber for **Low Stock**, and muted red for **Sold Out** or
destructive actions. These are functional exceptions to the single accent palette. Keep text contrast legible,
especially on disabled controls and badges.

## Typography and spacing

- Use `Inter`, `Geist`, or `system-ui` as one consistent sans stack. No Linear font dependency.
- Page title: 28px / 600; section heading: 20px / 600; body: 16px / 400; table and control text: 14px / 400–500;
  metadata: 12px / 400.
- Use a 4px spacing grid. Common steps: 4, 8, 12, 16, 24, 32, and 48px.
- Keep content to roughly 1280px. Use 24px card padding on desktop and 16px on smaller screens.
- Prefer 1px borders and 8px control radii; 12px card radii. Avoid oversized pills except compact status badges.

## Components and page patterns

| Component                | Treatment                                                                                                                                                    |
|--------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Header and admin sidebar | `canvas` or `surface-1`, clear active navigation, hairline separators.                                                                                       |
| Product card             | `surface-1`, 1px border, name then price and availability. Entire card need not be clickable if it harms keyboard use.                                       |
| Inventory table          | Clear columns for product, price, stock, status, and actions. Right-align numeric values. Compact rows with readable spacing and a subtle hover surface.     |
| Stock badge              | Text label plus restrained semantic color. Derive state from stock: `0` Sold Out, `1–5` Low Stock, `6+` In Stock. Threshold is a UI constant, not persisted. |
| Form field               | Label above input, helpful error below, `surface-1` background, `border-strong` outline, visible lavender focus ring.                                        |
| Primary button           | Lavender background, light text, 8px radius, compact 8px × 14px padding. One primary action per local decision area.                                         |
| Secondary button         | `surface-1`, light text, hairline border.                                                                                                                    |
| Destructive action       | Explicit label and confirmation; visually distinct from primary actions.                                                                                     |
| Feedback                 | Inline success or error message near the triggering control; clear empty and loading states.                                                                 |

The storefront uses a product grid and a focused product detail view. The admin product list uses a table first. Forms
for creating and editing products share one `ProductForm`. Small reusable primitives are `Button`, `Input`, `Badge`,
`Table`, and a confirmation `Dialog`; avoid building a generic design framework.

## Interaction and accessibility

- Preserve keyboard navigation and a visible 2px focus outline.
- Use semantic table headers, field labels, form errors, and button names.
- Disable purchase controls when stock is zero, but always handle server rejection because displayed stock can become
  stale.
- On narrow screens, keep actions discoverable and allow the inventory table to scroll horizontally rather than hiding
  essential columns.
- Honor reduced motion preferences. Use short transitions only for hover, focus, and disclosure feedback.

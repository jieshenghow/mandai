# Mandai Assessment Design System

This document describes the storefront and admin dashboard styling. Design tokens are defined in
[globals.css](./apps/web/app/globals.css), with warm light surfaces, dark green accents, and semantic status colors.

## Direction

- A restrained light interface with clear hierarchy and little decorative noise.
- Dense, readable inventory tables for admin work; quieter cards for the storefront.
- A dark green accent for primary actions, links, and keyboard focus.
- Surface changes and hairline borders express depth. Avoid gradients and heavy shadows.
- Status is communicated with text and shape as well as color.

## Tokens

CSS custom properties and Tailwind theme values in `apps/web/app/globals.css` define the design tokens.
Semantic tokens take precedence over component defaults.

| Token           | Value     | Use                              |
|-----------------|-----------|----------------------------------|
| `canvas`        | `#fff8f5` | Page background                  |
| `surface-1`     | `#ffffff` | Cards, table containers, sidebar |
| `surface-2`     | `#faf2ee` | Hovered rows, raised controls    |
| `surface-3`     | `#f4ece8` | Menus and nested surfaces        |
| `border`        | `#e9e1dd` | Dividers and card outlines       |
| `border-strong` | `#c1c8c3` | Control outlines                 |
| `text`          | `#1e1b19` | Main content                     |
| `text-muted`    | `#424844` | Supporting content               |
| `text-subtle`   | `#625e59` | Metadata and placeholders        |
| `accent`        | `#112e23` | Primary actions                  |
| `accent-hover`  | `#284438` | Primary action hover             |
| `focus`         | `#486457` | Visible focus outline            |

Use semantic status colors sparingly: green for **In Stock**, muted brown for **Low Stock**, and red for **Sold Out** or
destructive actions. These are functional exceptions to the single accent palette. Keep text contrast legible,
especially on disabled controls and badges.

## Typography and spacing

- Use the `Inter, Geist, system-ui, sans-serif` font stack.
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
| Form field               | Label above input, helpful error below, `surface-1` background, `border-strong` outline, visible green focus ring.                                        |
| Primary button           | Dark green background, light text, 8px radius, compact 8px × 14px padding. One primary action per local decision area.                                         |
| Secondary button         | `surface-1`, light text, hairline border.                                                                                                                    |
| Destructive action       | Explicit label and confirmation; visually distinct from primary actions.                                                                                     |
| Feedback                 | Inline success or error message near the triggering control; clear empty and loading states.                                                                 |

The storefront uses a product grid and a focused product detail view. The admin product list uses a table first. Forms
for creating and editing products share one `ProductForm`. Shared components include `Modal`, `ModalCancel`,
`Feedback`, and `Status`; forms use native button, input, and table elements.

## Interaction and accessibility

- Preserve keyboard navigation and a visible 2px focus outline.
- Use semantic table headers, field labels, form errors, and button names.
- Disable purchase controls when stock is zero, but always handle server rejection because displayed stock can become
  stale.
- On narrow screens, keep actions discoverable and allow the inventory table to scroll horizontally rather than hiding
  essential columns.
- Honor reduced motion preferences. Use short transitions only for hover, focus, and disclosure feedback.

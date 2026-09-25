# Web app

Next.js App Router with TypeScript and Tailwind CSS v4. Run it through the root workspace commands in [README.md](../../README.md).

All screens (login, registration, member workspace, admin overview, error, and 404) use Tailwind utilities. Shared color and font tokens are defined with `@theme` in `app/globals.css`, which also contains the global paragraph, focus, and reduced-motion defaults. Use semantic utilities such as `bg-canvas`, `bg-surface-1`, `text-text-subtle`, and `border-border` when adding UI. Follow [DESIGN.md](../../DESIGN.md) for the visual direction.

Tailwind runs through `@tailwindcss/postcss` in `postcss.config.mjs`; no JavaScript Tailwind configuration is needed. See the [official Tailwind Next.js guide](https://tailwindcss.com/docs/installation/framework-guides/nextjs).

Validation: `pnpm --filter @mandai/web lint` and `pnpm --filter @mandai/web build`.

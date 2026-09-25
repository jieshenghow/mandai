# Demo products

The catalog contains 30 products and 150 images (five per product).
Edit [products.json](./products.json) to define product details; photos live in the numbered product folders.
Run from the repository root after database setup:

```bash
pnpm db:seed
pnpm db:seed:products
```

The API server does not need to be running. The script uses the root `.env` database connection and attributes
creation records to the seeded `admin@example.com` account.

Each product has a stable `key`, a name, description, integer SGD `priceCents`, initial stock, and an ordered image list.
For example, the Plant Pot gallery starts with `01-plant-pot/01.jpg`.
The first image becomes the cover. Empty image lists are also valid. Each supplied product starts with 100 units.
Prices are sample SGD amounts; `1499` means S$14.99.

Images must be inside this folder: JPG, PNG, or WebP, at most 5 MB each and 40 megapixels, without animation.
Each product supports up to eight images. Imported images are converted to WebP and copied to the application's
upload directory; source photos remain here and can be committed with the manifest.

Rerunning skips products with the same key, including archived products. It does not overwrite admin edits or reset
purchased stock. Keep keys stable; use the admin dashboard to edit existing products and images.
Names do not identify seed records, so an existing manually created product with the same name is a separate product.

The complete manifest and its images are validated before writes. Each new product, its image metadata, initial
stock movement, and creation log commit in one transaction. If a later product fails, earlier products remain;
correct the problem and rerun to create the remaining products.

## Source files

The numbered folders and `product.txt` files are copied from the supplied test product collection.
`products.json` is the import manifest and the source of truth for the script. Product keys use the original SKUs
in lowercase; prices are converted to integer cents without changing their numeric value.

[source-products.json](./source-products.json) preserves the supplied source manifest and image URLs for products
11–30. [SOURCE.txt](./SOURCE.txt) describes that subset. Details for all 30 products are present in their respective
`product.txt` files. The source collection identifies DummyJSON as its catalog source. Category and source URL fields
are reference metadata and are not stored in the application database.

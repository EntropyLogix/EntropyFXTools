---
name: entropyfx-image-animation
description: Animate a still image by creating an explicit, portable .entropyfx project for visual review and refinement in EntropyLogix FX.
---

# Animate an image with EntropyLogix FX

Create a portable project that the user can inspect and refine in
EntropyLogix FX. Do not attempt to reproduce or simulate the private renderer.

Treat any natural-language visual direction as an authoring brief, not as a
renderer setting. Directions such as `subtle cassette sci-fi`, `energetic
street art`, `dreamlike fantasy`, or a custom description guide effect choice,
intensity, color, and composition. The resulting recipe must still contain only
explicit public effect parameters. If no direction is provided, infer one from
the image and explain the choice briefly.

## Workflow

1. Read [`docs/image-animation.md`](../../../../../docs/image-animation.md).
2. Inspect the source image and identify a restrained animation concept suited
   to its composition and intended display size.
3. Search [`contracts/effects-v1.json`](../../../../../contracts/effects-v1.json) for the
   relevant effects. Copy complete templates and change explicit values without
   deleting fields, except for the catalog-owned layout fields of a built-in
   sprite. Consult [`contracts/recipe-v2.schema.json`](../../../../../contracts/recipe-v2.schema.json)
   for types, ranges, enum values, and the mode-specific Bokeh shape.
4. Follow the `Use images and sprites` field list in the documentation. When
   using a built-in Sprite Sheet, read
   [`contracts/sprites-v1.json`](../../../../../contracts/sprites-v1.json) and preserve
   its sheet layout without storing `sheetColumns` or `sheetRows` in the recipe.
   Pass every user-owned image or custom font as a named input
   under its exact logical project path.
5. Validate the recipe by packing the source and inputs with `npm run entropyfx
   -- pack`, then run `npm run entropyfx -- validate` and `npm run entropyfx --
   inspect`. These commands work on macOS, Windows, and Linux.
6. Give the `.entropyfx` file to the user for visual review. Structural
   validation is not visual approval.

Keep files local unless the user explicitly authorizes a specific destination.
The CLI performs no upload, but any image analysis performed by a model follows
that model provider's data handling terms.

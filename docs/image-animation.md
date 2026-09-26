# Create an EntropyLogix FX animation

## Outcome

Creating an animation produces one `.entropyfx` project containing:

- one source image;
- one explicit version-3 recipe;
- every referenced user-owned auxiliary image or font;
- user-editable title, author, version, and description;
- an optional current output preset.

The toolkit validates and packages these files. It does not render effects or
replace visual review in EntropyLogix FX.

## Build a recipe

Start from the complete `template` of an effect in
[`effects-v1.json`](../contracts/effects-v1.json). Keep every template field in
the recipe, including values that appear inactive. Recipes do not rely on hidden
defaults, and unknown fields are rejected by the public schema. Use
[`recipe-v3.schema.json`](../contracts/recipe-v3.schema.json) to check types,
ranges, enum values, and mode-specific shapes; do not invent optional controls
outside the selected catalog template.

Structurally conditional version-3 fields include:

- `bokeh.bladeAngle`;
- `bokeh.bladeCount`.

They belong to the `bokeh` variant whose `apertureShape` is `polygon`. The
circle variant omits both fields. Other controls may be visually inactive in a
particular mode, but remain explicit members of their complete template.
Built-in Sprite Layer and Sprite Particles entries omit `sheetColumns` and
`sheetRows` because the built-in sprite catalog owns that layout. Custom
sprites require both fields.

Version 3 requires an ordered `spriteEffects` array on every `sprite_layer`
and `sprite_morph`, including an empty array when no local modifier is wanted.
Each entry must use one complete `hit_flash`, `outline_glow`, or
`disintegration` shape from the recipe schema. Array order is render order.
`sprite_particles` does not accept this public field in version 3.

Sprite morph transitions are ordered and may touch without overlapping. The
semantic validator uses an inclusive `1e-9` tolerance for adjacency and for a
transition ending at timeline position `1`, matching the renderer's public
timing rule.

The layer order in `primitives` is the composition order. Keep the source image
name in `recipe.source`, normalized positions in the `0..1` image space, and a
whole number of effect cycles in the complete loop. `timeline.frames` divided
by `timeline.frameRate` is the loop duration in seconds.

Every effect has an explicit `enabled` boolean. Set it to `false` to keep the
effect in the project while excluding it from preview and export. A disabled
effect remains structurally validated, but its auxiliary images are not
required or decoded until it is enabled again. An already embedded auxiliary
image may remain in the project so re-enabling the effect does not discard the
author's input.

Protected areas in `effectMasks` exclude their image area from effects. Version
2 and later support explicit `circle`, `rectangle`, `ellipse`, and `lasso`
shapes.

Static `elements` are composited in list order after effects and protected
areas. Version 2 and later support an inward `frame`, an `image_overlay` whose
image is embedded in the project, and editable `text` backed by its embedded
canonical raster. Later elements appear above earlier elements.

## Give an agent visual direction

An agent integration accepts a natural-language visual brief rather than a
closed renderer style enum. Examples include `subtle cassette sci-fi`,
`energetic street art`, `dreamlike fantasy`, or a custom direction with desired
motion and exclusions. The brief guides effect selection and explicit values;
it is not stored as a hidden preset and does not change recipe semantics. When
no direction is supplied, the agent may infer one from the image and should
state the choice before packaging the project.

## Use images and sprites

Effect image fields use role-based names rather than a suffix convention.
The complete version-3 set is:

- `depthMap`, `lightMask`, `lutImage`, `motionMap`;
- `revealedImage`, `returnMap`, `ribbonImage`, `shapeImage`;
- `spriteImage`, `targetImage`, `tileImage`, `transitionMap`, `unlitImage`.

A user-owned value in one of these fields uses a normalized logical path and
must be passed to `pack` with the same name when its effect is enabled:

```text
npm run entropyfx -- pack \
  --recipe recipe.json \
  --source source.png \
  --input inputs/depth.png=/absolute/path/depth.png \
  --out result.entropyfx
```

A built-in sprite uses an ID from
[`sprites-v1.json`](../contracts/sprites-v1.json), for example
`builtin:sprites/v1/fireflies_atlas`. Built-in sprites are versioned references
and are not embedded. Each Sprite Sheet entry owns its `sheetColumns`,
`sheetRows`, and recommended `frameSelection`. Do not copy the two layout fields
into a built-in sprite effect. Custom sprites keep explicit `sheetColumns` and
`sheetRows`, are ordinary user-owned project inputs, and are embedded once as
`AST`.

The `source` of an `image_overlay` or `text` element is likewise a named project
input. Pass it through `--input` under the exact logical name stored in the
element. The CLI does not rasterize fonts; a text authoring integration must
embed the canonical transparent image that corresponds to the explicit text
fields. A built-in font uses one of the IDs in the recipe schema. A custom font
uses its content-addressed `inputs/fonts/<sha256>-<name>.ttf`, `.otf` or `.woff2`
path and must be supplied as a second `--input`, so the project preserves both
editable text and its canonical raster.

## Review

Use `validate` before opening a project and `inspect` when checking its contents:

```text
npm run entropyfx -- validate result.entropyfx
npm run entropyfx -- inspect result.entropyfx
```

Open the project in EntropyLogix FX, inspect the live animation at its intended
display size, and adjust the explicit recipe. A structurally valid project is
not proof that its motion, visual weight, composition, or loop is visually good.

## Data boundary

The CLI reads and writes local files and performs no network requests. If an AI
agent analyzes an image or writes a recipe, that processing is governed by the
selected model provider and is not made local by this toolkit.

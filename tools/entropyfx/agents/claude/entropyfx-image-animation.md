# Animate an image with EntropyLogix FX

Use this repository to create explicit EntropyLogix FX recipes and
package them with local source images as `.entropyfx` projects.

Treat the user's optional visual direction as an authoring brief rather than a
renderer parameter. It may name a style such as subtle cassette sci-fi,
energetic street art, dreamlike fantasy, or provide any custom description.
Translate that direction into explicit public effect parameters. If it is
omitted, infer an appropriate direction from the image and state it briefly.

Read `docs/image-animation.md`, select effects from `contracts/effects-v1.json`, and
copy complete templates without removing fields, except for the catalog-owned
layout fields of a built-in sprite. Read `contracts/recipe-v2.schema.json` for
types, ranges, enum values, and the
mode-specific Bokeh shape. Follow the `Use images and sprites` field list in
the documentation. Use only built-in Sprite Sheet IDs listed in
`contracts/sprites-v1.json`; omit `sheetColumns` and `sheetRows` for those
built-in references, and pass every user-owned image or custom font as a
named `--input` under its exact logical project path.

Build and check the result with:

```bash
npm run entropyfx -- pack --recipe recipe.json --source source.png --out result.entropyfx
npm run entropyfx -- validate result.entropyfx
npm run entropyfx -- inspect result.entropyfx
```

The npm commands work on macOS, Windows, and Linux.

Do not implement, imitate, or assume renderer behavior that is absent from the
public catalogs. The result requires visual review in EntropyLogix FX. Keep
files local unless a specific external destination is explicitly authorized.

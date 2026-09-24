# EntropyFXTools

EntropyFXTools is the open collection of local companion tools for
EntropyLogix FX. It currently ships the EntropyLogix FX CLI, named
`entropyfx`, which creates, checks, inspects, and unpacks EntropyLogix FX
Project files without including or reimplementing the private renderer.

An `.entropyfx` file is a deterministic, self-contained animation project. It
stores the source image, explicit animation recipe, referenced user images,
user-editable information, and an optional current output preset. Rendering and
visual review happen in the EntropyLogix FX application.

## Requirements

- Node.js 26.3.1
- No package installation and no network access

The CLI and all repository checks run on macOS, Windows, and Linux. The
`run/*.sh` files are convenience wrappers for macOS and Linux; the equivalent
portable commands use npm:

```text
npm run entropyfx -- validate project.entropyfx
npm run entropyfx -- inspect project.entropyfx
npm run check
npm run setup
```

## Commands

```bash
./run/entropyfx.sh validate project.entropyfx
./run/entropyfx.sh inspect project.entropyfx
./run/entropyfx.sh pack \
  --recipe tools/entropyfx/examples/minimal/recipe.json \
  --source /path/to/source.png \
  --out project.entropyfx
./run/entropyfx.sh unpack project.entropyfx --out unpacked-project
```

Pass every user-owned image referenced by a role-based image field with a named
input under its exact logical project path. The
[image animation guide](docs/image-animation.md) lists every version-2 image
field and its mode-specific rules.

```bash
./run/entropyfx.sh pack \
  --recipe recipe.json \
  --source source.png \
  --input inputs/depth.png=/path/to/depth.png \
  --out project.entropyfx
```

Existing output paths are never replaced unless `--force` is present.

Use `--info info.json` to supply `title`, `author`, `version`, and `description`.
Use `--output-settings output.json` to preserve the current MP4, PNG sequence,
or sprite-sheet output preset. Without them, `pack` writes empty information
fields and omits the optional output preset.

## Repository layout

- `tools/entropyfx/` contains the EntropyLogix FX CLI, examples, tests, and agent integrations;
- `contracts/` contains public contracts shared by all tools;
- `docs/` contains the public format and image-animation documentation.

## Public contracts

- [Project format](docs/entropyfx-format.md)
- [Image animation guide](docs/image-animation.md)
- [Current recipe schema](contracts/recipe-v2.schema.json)
- [Published recipe v1 schema](contracts/recipe-v1.schema.json)
- [Effect catalog](contracts/effects-v1.json)
- [Built-in sprite catalog](contracts/sprites-v1.json)

The catalogs describe public behavior and complete starting templates. The
recipe schema defines required fields, types, ranges, enums, and the
mode-specific Bokeh variants. The contracts do not contain effect
implementations or built-in sprite image files.

## Agent integrations

The EntropyLogix FX CLI includes a Codex skill under
[`tools/entropyfx/agents/codex/entropyfx-image-animation`](tools/entropyfx/agents/codex/entropyfx-image-animation/SKILL.md)
and an equivalent Gemini CLI skill under
[`tools/entropyfx/agents/gemini/entropyfx-image-animation`](tools/entropyfx/agents/gemini/entropyfx-image-animation/SKILL.md).
The matching Claude instruction is stored under
[`tools/entropyfx/agents/claude/entropyfx-image-animation.md`](tools/entropyfx/agents/claude/entropyfx-image-animation.md).
All three create explicit recipes and call this local CLI. Image processing
performed by an external model follows that model provider's own data handling
terms.

## Development

```bash
./run/setup.sh
./run/check.sh
```

On Windows, use `npm run setup` and `npm run check`.

The source code and documentation in this repository are licensed under MIT.
The EntropyLogix FX application, renderer, product name, and branding are not
licensed by this repository.

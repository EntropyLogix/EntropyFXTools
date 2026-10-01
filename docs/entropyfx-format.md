# EntropyLogix FX Project (`.entropyfx`) format

Status: public specification. Container version 1 was published with
EntropyLogix FX 1.0.

## Versioning model

The EntropyLogix FX product version, container version, chunk version and
recipe schema version are independent contracts.

- The product version describes the set of application features and fixes.
- The container version changes only when the byte-level framing or required
  core-chunk contract becomes incompatible. Adding a noncritical optional chunk
  does not by itself require a new container version.
- Each chunk version identifies an incompatible change to that chunk's payload.
- The recipe `schemaVersion` identifies an incompatible generation of the JSON
  language. A compatible new primitive or element variant can extend the
  current generation. Renaming or reinterpreting an existing field, or adding
  a required field to an existing shape without a versioned migration, requires
  a new recipe schema generation.

A writer emits one complete canonical recipe generation without hidden
defaults. A reader may support older generations through an explicit,
version-selected migration into the current complete model. Published schema
files remain available under their original versioned names and are not
rewritten to describe a later incompatible generation.

Recipe schemas v1 and v2 are published and frozen. Schema v3 is the current
pre-release contract planned for EntropyLogix FX 1.2.2. In v3 the `layers` array
is the sole composition collection and its order is the processing order from
the virtual Source to Output. Each entry has one of the kinds `effect`,
`protected` or `element` and wraps its unchanged kind-specific payload under
`primitive`, `protection` or `element` respectively. Protected entries have
required `enabled` and
`allowElements` booleans. Disabled entries retain their authored order and
parameters but do not participate in rendering or require their auxiliary image.
Readers migrating v1 or v2 supply the explicit v3 fields and place legacy
protected areas first, effects in the middle and elements last. A v3 document
containing the retired `primitives`, `effectMasks` or `elements` arrays is
invalid rather than repaired through a hidden default. The 1.2.2 release freezes
the final v3 contract.

## Byte order and file header

All integers use little-endian byte order. A file starts with this 12-byte
header:

| Offset | Size | Value |
| ---: | ---: | --- |
| 0 | 7 | ASCII `ENTROPY` |
| 7 | 4 | Product type `ANIM` |
| 11 | 1 | Container version (`1`) |

The product type distinguishes an animation project from any future Entropy
format without adding fields that version 1 does not use.

## Chunks

The remainder is a sequence of chunks. Every chunk has a 13-byte header:

| Offset | Size | Field |
| ---: | ---: | --- |
| 0 | 3 | Uppercase ASCII letters or digits identifying the chunk |
| 3 | 1 | Chunk version |
| 4 | 1 | Flags; bit 0 means critical |
| 5 | 4 | Payload length |
| 9 | 4 | CRC32 |

The CRC32 covers the first nine bytes of the chunk header followed by the
payload. It detects accidental corruption; it is not authentication. Version 1
requires chunk versions from 1 through 255 and flag bits 1 through 7 to be zero.

A reader rejects an unknown critical chunk. An editor may ignore an unknown
noncritical chunk while interpreting a project, but must preserve its ID,
version and payload unchanged when rewriting that project. Truncation, a CRC
difference, unsupported flags and invalid core-chunk criticality are errors.

The container has no aggregate file-size or chunk-count limit. The 32-bit
payload length limits one chunk payload to 4 GiB minus one byte. A reader may
still fail when the host cannot allocate enough memory, but such a failure is
an implementation constraint rather than a format rule.

## Version 1 core chunks

| ID | Count | Critical | Payload |
| --- | ---: | --- | --- |
| `RCP` | exactly 1 | yes | Complete UTF-8 animation recipe JSON |
| `INF` | exactly 1 | no | User-editable project information JSON |
| `SRC` | exactly 1 | yes | Main source image file payload |
| `AST` | 0 or more | yes | One user-owned auxiliary asset per chunk |
| `OUT` | 0 or 1 | no | Current output preset JSON |

`RCP` retains the recipe's own `schemaVersion` because the recipe is also a
standalone contract. It owns animation behavior, timing and target raster
dimensions. It does not duplicate descriptive project information or output
codec settings.

`INF` version 1 is an object with exactly four required string fields. Empty
strings are valid, and writers do not synthesize timestamps:

```json
{"title":"","author":"","version":"","description":""}
```

`OUT` version 1 contains exactly one of these objects:

```json
{"format":"mp4_h264","bitrate":4000000}
{"format":"webp_animation","quality":90}
{"format":"apng_animation"}
{"format":"gif_animation","dithering":"ordered"}
{"format":"png_sequence"}
{"format":"png_sprite_sheet","columns":8}
{"format":"tga_sprite_sheet","columns":8}
```

An H.264 bitrate is an integer from 100,000 through 100,000,000 bits per
second. Animated WebP quality is an integer from 1 through 100. Animated PNG
has no lossy quality setting. Animated GIF dithering is `ordered` or `none`.
PNG and TGA sprite-sheet columns are a positive integer and must also be valid
for the recipe's frame count. When `OUT` is absent, an interactive application
uses its last local output setting and then its initial setting without
prompting. Saving from the editor writes the currently visible setting. A
reader may open a project whose noncritical output preset it cannot use, but
export requires an explicit supported selection rather than a silent
substitution.

`SRC` and `AST` begin with a 32-bit descriptor length, followed by the UTF-8
JSON descriptor and then the original encoded file bytes. The descriptor has
exactly `name` and `mediaType` fields. A name is a normalized relative path;
absolute paths, backslashes, empty segments, `.` and `..` are invalid. All file
names in one project are unique.

Built-in sprite and font assets are not embedded. Recipes refer to them through
versioned identifiers such as `builtin:sprites/v1/fireflies_atlas` or
`builtin:fonts/v1/inter`. Text in recipe v3 has no generated image `source`;
its content and layout are rendered by the Engine from the recipe and the
selected font. An optional `animation` object stores explicit text channels;
its absence or wholly inactive channels use the static prepared raster. The
optional `outline` object stores the output-pixel width and color of the glyph
outline; a zero width disables it. Every referenced image
or font provided by a user is
embedded as `AST`, so the project does not depend on its original filesystem
location.
Published v1/v2 text still requires its embedded raster `source`. The editor
migrates those recipes to semantic v3 text; a v3 `text.source` is rejected.

## Version 1 project preview extension

`PRV` is an optional, noncritical chunk containing a compact animated preview
of the saved project. It occurs at most once. Its chunk version is `1`, and its
payload contains a one-byte media type followed directly by the complete
encoded media file:

| Payload offset | Size | Field |
| ---: | ---: | --- |
| 0 | 1 | Preview media type |
| 1 | remaining payload | Encoded media bytes |

Type `0x01` is an MP4 file containing H.264 video. Type `0x00` is invalid.
Other values are currently unassigned and unsupported. A version-1 writer only
creates type `0x01`; an editor that cannot play a nonzero type preserves the
noncritical chunk unchanged and uses its static fallback. The media payload
must not be empty.

The MP4 owns its dimensions, frame rate and duration, so `PRV` does not repeat
those fields and does not contain a JSON descriptor or file name. The preview
is advisory presentation data: removing it does not change the recipe, source,
assets or rendered output of the project.

## Deterministic writing

A version-1 writer emits `RCP`, `INF`, `SRC`, then `AST` chunks sorted by logical
name, followed by `OUT` when present. Preserved noncritical extensions, including
`PRV`, follow, sorted by ID, version and payload bytes. JSON uses UTF-8 without
a byte-order mark. Given the same recipe text, information, output preset, input
bytes and extension payloads, the writer produces the same archive bytes.

# EntropyLogix FX Project (`.entropyfx`) format

Status: public specification draft. Version 1 may be replaced in place before
the first public EntropyLogix FX release.

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

The 32-bit payload length describes the binary capacity of the container, not a
promise that an application will allocate that amount. The reference tools use
defensive application limits: 256 MiB per project, 1,024 chunks, 128 MiB per
chunk, 4 MiB for `RCP`, 64 KiB for `INF`, 16 KiB for `OUT` and a file
descriptor, and 1,024 UTF-8 bytes for a logical file name. Implementations may
use lower limits if they report them as application limits rather than format
constraints.

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
`builtin:fonts/v1/inter`. Every referenced image or font provided by a user is
embedded as `AST`, so the project does not depend on its original filesystem
location.

## Deterministic writing

A version-1 writer emits `RCP`, `INF`, `SRC`, then `AST` chunks sorted by logical
name, followed by `OUT` when present. Preserved noncritical extensions follow,
sorted by ID, version and payload bytes. JSON uses UTF-8 without a byte-order
mark. Given the same recipe text, information, output preset and input bytes,
the writer produces the same archive bytes.

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
required `enabled`, `allowElements` and shape-specific geometry fields.
`feather` is the spatial transition width: protection is full inside the shape
and falls to zero across that outer band according to the required
`featherFalloff` profile (`smooth`, `linear`, `sharp` or `wide`). Disabled
entries retain their authored order and parameters but do not participate in
rendering or require their auxiliary image.
The pre-release v3 scope rollout currently covers `radial_blur`,
`color_multiply`, `color_key`, `opacity`, `tint`, `posterize`, `tone_mapping`,
`film_grain`, `blur`, `precise_blur`, `motion_blur`, `edge_detection`,
`local_contrast`, `dithering`, `clouds`, `fog`, `energy_veins`, `color_remap`,
`painterly_smoothing`, `color_grading`, `noise_field`, `edge_glow`, `caustics`,
`iridescence`, `halftone`, `depth_fog`, `masked_lighting`, `tiling_array`,
`color_lut`, `drop_shadow`, `flow_blur`, `tape_tracking`, `camera_glitch`,
`surface_ripple`, `vector_warp`, `heat_haze`, `refraction`, `water_flow` and
`parallax`, plus `chromatic_aberration`, `drift`, `shake`,
`directional_source_rays`, `oscillating_shift`, `directional_waves`,
`region_shift`, `reflection`, `rain_on_glass`, `bokeh`, `signal_breakup`,
`volumetric_clouds`, `light_pillar`, `hex_field`, `shimmer`, `light_sweep`,
`xray_scan`, `gradient_blend`, `flame_field`, `image_ribbon`, `image_transition`,
`waveform`, `vignette`, `sway`, `analog_display`, `grid_scan`,
`topographic_contours`, `ascii_art`, `pixel_grid`, `pixel_sorting`, `stars`,
`shooting_stars`, `dust`, `rain`, `snow`, `bubbles`, `swarm`, `droplets`,
`leaves`, `glyphs`, `dna_helix`, `glitter`, `constellation`, `perspective`,
`skew`, `projective_transform`, `bloom`, `star_glare`, `fluid_lens`,
`brightness_pulse`, `flicker`, `local_shift`, `lens_flare`, `spotlight` and `fluid`.
Each requires a scalar `primitive.scope` selector (`radial`, `rectangular`
or `global`), with flat `x`, `y`, `radius`, `width` and `height` fields.
There are no separate `radial` or `region` sections for these effects.
Both shapes share the same center `x/y`; the rectangle starts at
`x - width/2`, `y - height/2`. Sizes remain stored when inactive.
The selector changes the output area, not the sampling algorithm, except
for the explicitly shape-aware `fluid_lens`, `brightness_pulse`, `flicker` and `local_shift`
profiles described below.
Global has no local output restriction. Scope permits changes inside its area;
it does not require every pixel inside to change.
Brightness pulse and Flicker preserve their original radial profiles. Their
rectangular Source profile applies the same smoothstep falloff to the maximum
of the distances from the shared center, normalized to each half-extent.
Geometry mode uses the existing inward `feather`, measured from the nearest
rectangle edge and capped at the shorter half-extent. Global has no spatial
falloff. Source mode still compares each input pixel's RGB with the input
sample at shared `x/y`, including in Global. Geometry mode ignores that sample;
Global also ignores inactive size fields and `feather`. Timing, Flicker's
randomness, intensity, RGB amplification and alpha are unchanged.
The required v3 `maskMode` is `source` or `geometry`; frozen v1/v2 retain
`source` or `radial`. Migration maps `radial` to `geometry`, selects radial
scope and adds inactive `width: 1`, `height: 1`, preserving the original
output. A v3 primitive using the old value is rejected, not repaired.
Local shift preserves its original motion and rendering inside the radial
scope. An approved correction clips legacy writes outside the displayed
circle, also when rendering v1/v2; those pixels retain the current layer's
input, without changing the algorithm's center or movement profile. Rectangular
uses the same `1 - smoothstep(0.65, 1, distance)` movement falloff with distance
equal to the maximum distance from the shared center normalized to each
half-extent. Global applies the unchanged motion to the whole frame, without
local falloff; inactive Position and size values do not affect the result.
Strength, Angle, animation and deterministic random motion are unchanged.
Sampling outside Scope remains available, while RGBA writes remain inside.
Legacy v1/v2 explicitly migrates to radial scope with inactive `width: 1`
and `height: 1`, retaining all old parameters. Incomplete v3 is rejected.
Lens flare, Spotlight and Fluid default to Global, preserving their former
full-frame output. Their shared `x/y` remains the optical source, light center
or emitter position, including in Global. The former algorithmic `radius`
is required in v3 as `flareScale`, `lightRadius` or `emitterRadius`, respectively.
Values, ranges `(0, 2]` and mathematics are unchanged: `flareScale` is a
dimensionless optical coefficient; the other two are normalized to the shorter
frame side. The independent `radius` now defines only the Scope circle.
Local scopes clip final RGBA writes without restricting fluid simulation,
shape-image reads or lens-ghost calculations. Legacy v1/v2 explicitly migrates
to Global with `radius: 0.25`, `width: 1`, `height: 1`, preserving source positions
and renaming, not changing, the algorithmic radius. Incomplete v3 is rejected.
Scope coordinates and rectangular extents are normalized to their frame axes;
the radial radius is normalized to the shorter frame side. This scope has no
new feather parameter. Legacy v1/v2 Radial blur explicitly migrates to Global;
incomplete v3 primitives are not repaired. Legacy rectangles are explicitly
migrated from their top-left corner to the shared center. Sampling radii use
`blurRadius` in Blur, Precise blur, Radial blur, Edge glow, Bokeh, Painterly
smoothing, Drop shadow and Flow blur. Motion blur uses `blurLength` for its
sampling extent. Their original values, units and mathematics are unchanged.
Shimmer, Light sweep and X-ray scan use `bandWidth` in v3 for the former
algorithmic `width`, retaining its values, units and range `(0, 1]`.
Published v1/v2 continue to require `width` and `region`; migration explicitly
renames the band thickness and moves the rectangle to flat scope geometry,
preserving their output. For these three effects, the visible scope also
defines the band's travel domain: Rectangular uses the rectangle, Radial
uses the circle's diameter bounding square and clips writes to the circle,
and Global uses the whole frame. Inactive geometry does not affect that path.
The band's profile, phase and cycle timing remain unchanged; a larger scope
extends its travel in the same cycle time. There is no separate field size.
Gradient blend, Flame field, Image ribbon, Image transition, Waveform and
Vignette also use the active scope as their visible field geometry. Their
local gradient, height profile, ribbon deformation, transition field,
waveform and vignette profile use the same rectangle, circle-diameter square
or full-frame coordinates, without a second Position/Size. Their profile
parameters, animation timing and auxiliary-image sampling are unchanged.
Both the warp and color stages of Flame field respect the output scope.
Sway uses the same active scope for its visible deformation domain. Its former
algorithmic `radius` is named `wavelength` in v3 and remains a normalized wave
period relative to the active scope height; `strength` remains the deformation
amplitude. Legacy v1/v2 `radius` is explicitly migrated to `wavelength`.
Analog display, Grid scan, Topographic contours and ASCII art use the active
scope as their visible display, projected room, contour field or character
grid domain. Their scanline spacing, noise, projection, contour profile and
character sampling retain their original mathematics. Sample reads can extend
outside the scope; only the final output is clipped to its selected shape.
Pixel grid uses the active domain's top-left grid origin and its unchanged
`cellSize`, `offsetX` and `offsetY` sampling. Pixel sorting retains complete
row or column spans of the active domain's rectangular bounds. A radial scope
clips the sorted output to the circle, not the input pool used for sorting.
Global uses the full frame; legacy rectangular sampling and edge profiles
remain unchanged.
Stars, Shooting stars, Dust, Rain, Snow, Bubbles, Swarm, Droplets, Leaves,
Glyphs and DNA helix retain their particle placement and movement in the
active domain. A radial scope clips each disk, line and glow's final pixels
to the circle rather than rejecting particles by their center. Rectangular
retains the legacy integer bounds, including pixels touched by fractional edges.
Global uses the full frame. Random draws, clocks, particle sizes, trails and
glow profiles retain their original mathematics.
Glitter and Constellation use the same active placement domain and clip their
disks, glows and lines to the selected scope. Their previous writes outside the
rectangle were a bug: the approved correction also applies when reading v1/v2
or migrating them. Interior pixels and effect mathematics remain unchanged;
outside pixels retain the layer input RGBA. This is an explicit exception to
legacy byte identity, not a new emitter domain or a Global default.
Perspective, Skew and Projective transform retain their original transform
in the active domain: the rectangle, the circle's diameter bounding square
or the full frame. The radial shape clips final writes, not sample reads.
Pivot, rotations, scales, offsets, bend and source edge handling retain their
existing mathematics. Projective transform's `edgeMode` still repeats, clamps
or clears samples outside the transformed source rectangle; clearing alpha
never changes pixels outside the output scope. No second transform region is added.
Bloom and Star glare retain light extraction in the active scope's bounding
domain: the rectangle, the circle's diameter bounding square or the full frame.
Sample reads outside the circle remain allowed; the radial shape clips only
final writes. Bloom's former algorithmic `radius` is named `spread` in v3,
retaining its dimensionless 0–10 scale of multilevel blur and emitted energy.
Star glare's former `radius` is named `rayLength`, retaining its length relative
to the shorter frame side, dependent blur and independent `intensity` control.
Both are separate from the output scope `radius`. Published v1/v2 keep the old
field; migration explicitly renames it without changing its value or mathematics.
Rectangular retains the original output, including Bloom's full-rectangle edge
exception. No second light-source region is added.
Fluid lens is explicitly shape-aware: Radial derives its refraction, curved-edge
normals, rim light and shadow from an actual circle; Rectangular uses rounded
rectangle geometry. Global covers the whole frame without a local or source-alpha
outline, retaining magnification, blur, frost, tint, brightness and liquid motion.
Source alpha is unchanged. `cornerRadius` is active only in Rectangular but remains
stored in other scopes. `blurRadius` and the other algorithm fields keep their
names, with the approved v3 `lensZoom` range extended to 0–0.9; published v1/v2
keep 0–0.2. Interior magnification is `1 / (1 - lensZoom)`, reaching 10× at 0.9;
1 and inverted scaling are rejected. Curved-edge normals and proximity use the
same local multi-scale mask sampling for opaque and transparent inputs, across
`edgeWidth`; isolated alpha outside the sampling neighborhood cannot switch the
algorithm. This is an intentional refraction correction, also for legacy renders.
Legacy pixel identity is not required for this effect; published
v1/v2 field schemas remain frozen and explicitly migrate their region to Rectangular.
Radial blur and Chromatic aberration also use `x/y` as their optical center.
Hex field uses the same `x/y` as its pattern center, editable in Global too;
`scale` still controls cell size. Inactive scope sizes do not scale its pattern.
Radial scopes
clip output to the circle without introducing a new soft boundary; existing
rectangular profiles and effect feather behavior remain unchanged.
Scopes can extend beyond the frame; input sampling is not clipped to them.
`tileRegion` remains the independent tiling source crop. Auxiliary depth,
lighting, motion maps and LUT layout retain their original sampling coordinates.
The primitive contains scope geometry only for the shapes supported by its effect;
those geometries remain required even while inactive. Unsupported shape
geometries are rejected. The full-catalog rollout remains in progress.
For sprite animation, `sprite_layer` keeps the signed `cycles` direction
contract. `sprite_particles` requires `sequenceDirection` when
`frameSelection` is `"particle_age"`, and each sequential `sprite_morph` stage
requires its own `sequenceDirection`; both values are `"forward"` or
`"reverse"`. Random, angle-selected and fixed-frame modes do not accept this
field. The shared sequence mapper clamps progress `p` to `[0, 1]`, computes
`i = min(floor(p * N + 1e-9), N - 1)` for `N` frames and reflects the index
as `N - 1 - i` for reverse. The tolerance is measured in frame-index units.
Readers use this corrected mapper for legacy recipes too; frame-boundary
rounding and negative Sprite layer `once_hold` samples may differ from 1.2.1.
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
`builtin:fonts/v1/inter`. V3 `text` is semantic: it has no generated raster
`source`; the Engine shapes and rasterizes it from the recipe. An optional
`animation` object stores explicit text channels, while its absence or wholly
inactive channels use the static prepared raster.
Published v1/v2 text retains its raster `source` contract; opening those recipes
in the editor migrates them to semantic v3 text. A v3 `text.source` is rejected.
Every referenced image or user-provided font is embedded as `AST`, so the
project does not depend on its original filesystem location.

## Version 1 project preview extension

`PRV` is an optional, noncritical chunk containing a compact animated preview
of the saved project. It occurs at most once. Its chunk version is `1`, and its
payload contains a one-byte media type followed directly by the complete
encoded media file:

| Payload offset | Size | Field |
| ---: | ---: | --- |
| 0 | 1 | Preview media type |
| 1 | remaining payload | Encoded media bytes |

Type `0x01` is an Animated WebP file and preserves RGBA alpha. Type `0x00` is
invalid. Other values are currently unassigned and unsupported. A version-1
writer creates only type `0x01`; an editor that cannot play the media preserves
the noncritical chunk unchanged and uses its static fallback. The media payload
must not be empty.

The encoded media owns its dimensions, frame rate and duration, so `PRV` does
not repeat those fields and does not contain a JSON descriptor or file name.
The preview is advisory presentation data: removing it does not change the
recipe, source, assets or rendered output of the project.

## Deterministic writing

A version-1 writer emits `RCP`, `INF`, `SRC`, then `AST` chunks sorted by logical
name, followed by `OUT` when present. Preserved noncritical extensions,
including `PRV`, follow sorted by ID, version and payload bytes. JSON uses UTF-8
without a byte-order mark. Given the same recipe text, information, output
preset, input bytes and extension payloads, the writer produces the same
archive bytes.

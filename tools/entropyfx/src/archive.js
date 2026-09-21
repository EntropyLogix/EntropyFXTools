const BRAND = new Uint8Array([0x45, 0x4e, 0x54, 0x52, 0x4f, 0x50, 0x59]);
const PRODUCT = new Uint8Array([0x41, 0x4e, 0x49, 0x4d]);
const CONTAINER_VERSION = 1;
const HEADER_BYTES = 12;
const CHUNK_HEADER_BYTES = 13;
const CHUNK_VERSION = 1;
const CRITICAL = 1;
const MAX_CHUNKS = 1024;
const MAX_CHUNK_BYTES = 128 * 1024 * 1024;
const MAX_DESCRIPTOR_BYTES = 16 * 1024;
const MAX_INFO_BYTES = 64 * 1024;
const MAX_LOGICAL_NAME_BYTES = 1024;
const MAX_OUTPUT_BYTES = 16 * 1024;
const MAX_PROJECT_BYTES = 256 * 1024 * 1024;
const MAX_RECIPE_BYTES = 4 * 1024 * 1024;
const CORE_CHUNK_IDS = new Set(['AST', 'INF', 'OUT', 'RCP', 'SRC']);
const INFO_FIELDS = ['title', 'author', 'version', 'description'];
const textDecoder = new TextDecoder('utf-8', { fatal: true });
const textEncoder = new TextEncoder();

const crcTable = new Uint32Array(256);
for (let index = 0; index < crcTable.length; index++) {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (0xedb88320 & -(value & 1));
  crcTable[index] = value >>> 0;
}

function bytes(value, context) {
  if (value instanceof Uint8Array)
    return value;
  if (value instanceof ArrayBuffer)
    return new Uint8Array(value);
  if (ArrayBuffer.isView(value))
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  throw new Error(`${context} must be binary data`);
}

function concatenate(parts) {
  const size = parts.reduce((total, part) => total + part.byteLength, 0);
  if (!Number.isSafeInteger(size) || size > MAX_PROJECT_BYTES)
    throw new Error('project archive exceeds the 256 MiB application limit');
  const output = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

function crc32(parts) {
  let checksum = 0xffffffff;
  for (const part of parts) {
    for (const byte of part)
      checksum = crcTable[(checksum ^ byte) & 0xff] ^ (checksum >>> 8);
  }
  return (checksum ^ 0xffffffff) >>> 0;
}

function validChunkId(id) {
  return typeof id === 'string' && /^[A-Z0-9]{3}$/.test(id);
}

export function validateProjectPath(name, context) {
  if (typeof name !== 'string' || name.length === 0)
    throw new Error(`${context} name is required`);
  if (name.includes('\\') || name.startsWith('/') || name.endsWith('/'))
    throw new Error(`${context} name must be a normalized relative path`);
  const segments = name.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..'))
    throw new Error(`${context} name must not contain empty, current, or parent segments`);
  if (textEncoder.encode(name).byteLength > MAX_LOGICAL_NAME_BYTES)
    throw new Error(`${context} name exceeds the 1024-byte application limit`);
}

function validateMediaType(mediaType, context) {
  if (typeof mediaType !== 'string'
      || !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(mediaType))
    throw new Error(`${context} media type is invalid`);
}

function exactObject(value, fields, context) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${context} must be an object`);
  const keys = Object.keys(value);
  for (const field of fields) {
    if (!keys.includes(field))
      throw new Error(`${context}.${field} is required`);
  }
  for (const key of keys) {
    if (!fields.includes(key))
      throw new Error(`${context}.${key} is not allowed`);
  }
}

function normalizeInfo(value) {
  exactObject(value, INFO_FIELDS, 'project info');
  const info = {};
  for (const field of INFO_FIELDS) {
    if (typeof value[field] !== 'string')
      throw new Error(`project info.${field} must be a string`);
    info[field] = value[field];
  }
  return info;
}

function normalizeOutput(value) {
  if (value === null || value === undefined)
    return null;
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('project output must be an object');
  if (value.format === 'mp4_h264') {
    exactObject(value, ['format', 'bitrate'], 'project output');
    if (!Number.isSafeInteger(value.bitrate) || value.bitrate < 100000
        || value.bitrate > 100000000)
      throw new Error('project output.bitrate must be a whole number from 100000 to 100000000');
    return { format: value.format, bitrate: value.bitrate };
  }
  if (value.format === 'webp_animation') {
    exactObject(value, ['format', 'quality'], 'project output');
    if (!Number.isSafeInteger(value.quality) || value.quality < 1 || value.quality > 100)
      throw new Error('project output.quality must be a whole number from 1 to 100');
    return { format: value.format, quality: value.quality };
  }
  if (value.format === 'gif_animation') {
    exactObject(value, ['format', 'dithering'], 'project output');
    if (!['none', 'ordered'].includes(value.dithering))
      throw new Error('project output.dithering must be none or ordered');
    return { dithering: value.dithering, format: value.format };
  }
  if (value.format === 'apng_animation') {
    exactObject(value, ['format'], 'project output');
    return { format: value.format };
  }
  if (value.format === 'png_sequence') {
    exactObject(value, ['format'], 'project output');
    return { format: value.format };
  }
  if (value.format === 'png_sprite_sheet' || value.format === 'tga_sprite_sheet') {
    exactObject(value, ['format', 'columns'], 'project output');
    if (!Number.isSafeInteger(value.columns) || value.columns < 1 || value.columns > 1000000)
      throw new Error('project output.columns must be a whole number from 1 to 1000000');
    return { format: value.format, columns: value.columns };
  }
  throw new Error(`project output.format ${String(value.format)} is unsupported`);
}

function normalizeInputFile(file, role, context) {
  if (!file || typeof file !== 'object')
    throw new Error(`${context} is required`);
  validateProjectPath(file.name, context);
  validateMediaType(file.mediaType, context);
  return { bytes: bytes(file.bytes, context), mediaType: file.mediaType, name: file.name, role };
}

function encodeChunk(id, payload, { critical = true, version = CHUNK_VERSION } = {}) {
  if (!validChunkId(id))
    throw new Error(`chunk ID ${id} must be three uppercase ASCII letters or digits`);
  if (!Number.isSafeInteger(version) || version < 1 || version > 0xff)
    throw new Error(`${id}: project chunk version must be from 1 to 255`);
  if (payload.byteLength > MAX_CHUNK_BYTES)
    throw new Error(`${id}: project chunk exceeds the 128 MiB application limit`);
  const header = new Uint8Array(CHUNK_HEADER_BYTES);
  header.set(textEncoder.encode(id), 0);
  header[3] = version;
  header[4] = critical ? CRITICAL : 0;
  const view = new DataView(header.buffer);
  view.setUint32(5, payload.byteLength, true);
  view.setUint32(9, crc32([header.subarray(0, 9), payload]), true);
  return concatenate([header, payload]);
}

function jsonPayload(value, maximum, context) {
  const payload = textEncoder.encode(`${JSON.stringify(value)}\n`);
  if (payload.byteLength > maximum)
    throw new Error(`${context} exceeds the ${maximum / 1024} KiB application limit`);
  return payload;
}

function encodeFileChunk(id, file) {
  const descriptor = jsonPayload({
    mediaType: file.mediaType,
    name: file.name,
  }, MAX_DESCRIPTOR_BYTES, `${id}: file descriptor`);
  const length = new Uint8Array(4);
  new DataView(length.buffer).setUint32(0, descriptor.byteLength, true);
  return encodeChunk(id, concatenate([length, descriptor, file.bytes]));
}

function normalizeOptionalChunk(chunk, index) {
  const context = `optionalChunks[${index}]`;
  if (!chunk || typeof chunk !== 'object')
    throw new Error(`${context} is required`);
  if (!validChunkId(chunk.id))
    throw new Error(`${context} ID must be three uppercase ASCII letters or digits`);
  if (CORE_CHUNK_IDS.has(chunk.id))
    throw new Error(`${context} ID ${chunk.id} is reserved`);
  const version = chunk.version ?? CHUNK_VERSION;
  if (!Number.isSafeInteger(version) || version < 1 || version > 0xff)
    throw new Error(`${context} version must be from 1 to 255`);
  return { id: chunk.id, payload: bytes(chunk.payload, context), version };
}

function compareOptionalChunks(left, right) {
  if (left.id !== right.id)
    return left.id < right.id ? -1 : 1;
  if (left.version !== right.version)
    return left.version - right.version;
  const shared = Math.min(left.payload.byteLength, right.payload.byteLength);
  for (let index = 0; index < shared; index++) {
    if (left.payload[index] !== right.payload[index])
      return left.payload[index] - right.payload[index];
  }
  return left.payload.byteLength - right.payload.byteLength;
}

function projectHeader() {
  const header = new Uint8Array(HEADER_BYTES);
  header.set(BRAND, 0);
  header.set(PRODUCT, 7);
  header[11] = CONTAINER_VERSION;
  return header;
}

export async function createProjectArchive({
  info, output = null, recipe, source, auxiliaryInputs = [], optionalChunks = [],
  unsupportedOutput = null,
}) {
  if (typeof recipe !== 'string')
    throw new Error('recipe must be a JSON string');
  const recipeBytes = textEncoder.encode(recipe);
  if (recipeBytes.byteLength > MAX_RECIPE_BYTES)
    throw new Error('project recipe exceeds the 4 MiB application limit');
  let parsedRecipe;
  try {
    parsedRecipe = JSON.parse(recipe);
  } catch (error) {
    throw new Error(`project recipe is invalid: ${error instanceof Error ? error.message : error}`);
  }
  const projectInfo = normalizeInfo(info);
  const projectOutput = normalizeOutput(output);
  if (unsupportedOutput !== null
      && (!(unsupportedOutput instanceof Uint8Array) || projectOutput !== null))
    throw new Error('unsupportedOutput must be binary data and requires output to be null');
  if (['png_sprite_sheet', 'tga_sprite_sheet'].includes(projectOutput?.format)
      && projectOutput.columns > parsedRecipe?.timeline?.frames)
    throw new Error('project output.columns must not exceed recipe.timeline.frames');
  if (!Array.isArray(auxiliaryInputs))
    throw new Error('auxiliaryInputs must be an array');
  if (!Array.isArray(optionalChunks))
    throw new Error('optionalChunks must be an array');
  const sourceFile = normalizeInputFile(source, 'source', 'source');
  const auxiliaryFiles = auxiliaryInputs
    .map((file, index) => normalizeInputFile(file, 'auxiliary', `auxiliaryInputs[${index}]`))
    .sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
  const names = new Set([sourceFile.name]);
  for (const file of auxiliaryFiles) {
    if (names.has(file.name))
      throw new Error(`duplicate project file ${file.name}`);
    names.add(file.name);
  }
  const extensions = optionalChunks.map(normalizeOptionalChunk).sort(compareOptionalChunks);
  if (3 + auxiliaryFiles.length + (projectOutput || unsupportedOutput ? 1 : 0)
      + extensions.length > MAX_CHUNKS)
    throw new Error('project archive exceeds the 1024-chunk application limit');
  return concatenate([
    projectHeader(),
    encodeChunk('RCP', recipeBytes),
    encodeChunk('INF', jsonPayload(projectInfo, MAX_INFO_BYTES, 'INF chunk'), { critical: false }),
    encodeFileChunk('SRC', sourceFile),
    ...auxiliaryFiles.map((file) => encodeFileChunk('AST', file)),
    ...(projectOutput ? [encodeChunk(
      'OUT', jsonPayload(projectOutput, MAX_OUTPUT_BYTES, 'OUT chunk'), { critical: false },
    )] : unsupportedOutput ? [encodeChunk('OUT', unsupportedOutput, { critical: false })] : []),
    ...extensions.map((chunk) => encodeChunk(chunk.id, chunk.payload, {
      critical: false,
      version: chunk.version,
    })),
  ]);
}

function validateHeader(archive) {
  if (archive.byteLength < HEADER_BYTES)
    throw new Error('project archive is truncated');
  for (let index = 0; index < BRAND.length; index++) {
    if (archive[index] !== BRAND[index])
      throw new Error('project archive signature is invalid');
  }
  for (let index = 0; index < PRODUCT.length; index++) {
    if (archive[7 + index] !== PRODUCT[index])
      throw new Error('ENTROPY product type is not ANIM');
  }
  if (archive[11] !== CONTAINER_VERSION)
    throw new Error('project container version is unsupported');
}

function decodeChunks(archive) {
  const chunks = [];
  let offset = HEADER_BYTES;
  while (offset < archive.byteLength) {
    if (chunks.length >= MAX_CHUNKS)
      throw new Error('project archive exceeds the 1024-chunk application limit');
    if (archive.byteLength - offset < CHUNK_HEADER_BYTES)
      throw new Error('project chunk header is truncated');
    const id = textDecoder.decode(archive.subarray(offset, offset + 3));
    if (!validChunkId(id))
      throw new Error('project chunk ID is invalid');
    const version = archive[offset + 3];
    const flags = archive[offset + 4];
    const header = new DataView(archive.buffer, archive.byteOffset + offset, CHUNK_HEADER_BYTES);
    const length = header.getUint32(5, true);
    if (length > MAX_CHUNK_BYTES)
      throw new Error(`${id}: project chunk exceeds the 128 MiB application limit`);
    const payloadStart = offset + CHUNK_HEADER_BYTES;
    const payloadEnd = payloadStart + length;
    if (!Number.isSafeInteger(payloadEnd) || payloadEnd > archive.byteLength)
      throw new Error(`${id}: project chunk payload is truncated`);
    const payload = archive.subarray(payloadStart, payloadEnd);
    if (header.getUint32(9, true) !== crc32([archive.subarray(offset, offset + 9), payload]))
      throw new Error(`${id}: project chunk checksum differs`);
    chunks.push({ critical: (flags & CRITICAL) !== 0, flags, id, payload, version });
    offset = payloadEnd;
  }
  return chunks;
}

function decodeJson(payload, context) {
  try {
    return JSON.parse(textDecoder.decode(payload));
  } catch (error) {
    throw new Error(`${context} is invalid: ${error instanceof Error ? error.message : error}`);
  }
}

function decodeFile(chunk, role, index) {
  const context = `${chunk.id} chunk ${index}`;
  if (chunk.payload.byteLength < 4)
    throw new Error(`${context} file descriptor is truncated`);
  const descriptorLength = new DataView(
    chunk.payload.buffer, chunk.payload.byteOffset, 4).getUint32(0, true);
  if (descriptorLength === 0 || descriptorLength > MAX_DESCRIPTOR_BYTES
      || 4 + descriptorLength > chunk.payload.byteLength)
    throw new Error(`${context} file descriptor is truncated`);
  const descriptor = decodeJson(
    chunk.payload.subarray(4, 4 + descriptorLength), `${context} file descriptor`);
  exactObject(descriptor, ['mediaType', 'name'], `${context} file descriptor`);
  validateProjectPath(descriptor.name, context);
  validateMediaType(descriptor.mediaType, context);
  return {
    bytes: chunk.payload.subarray(4 + descriptorLength),
    mediaType: descriptor.mediaType,
    name: descriptor.name,
    role,
  };
}

export async function openProjectArchive(value) {
  const archive = bytes(value, 'project archive');
  if (archive.byteLength > MAX_PROJECT_BYTES)
    throw new Error('project archive exceeds the 256 MiB application limit');
  validateHeader(archive);
  const chunks = decodeChunks(archive);
  for (const chunk of chunks) {
    if ((chunk.flags & ~CRITICAL) !== 0)
      throw new Error(`${chunk.id}: project chunk flags are unsupported`);
    if (!CORE_CHUNK_IDS.has(chunk.id)) {
      if (chunk.critical)
        throw new Error(`${chunk.id}: unknown critical project chunk`);
      continue;
    }
    if (chunk.version !== CHUNK_VERSION)
      throw new Error(`${chunk.id}: project chunk version is unsupported`);
    const mustBeCritical = ['AST', 'RCP', 'SRC'].includes(chunk.id);
    if (chunk.critical !== mustBeCritical)
      throw new Error(`${chunk.id}: project chunk critical flag is invalid`);
  }
  const byId = (id) => chunks.filter((chunk) => chunk.id === id);
  if (byId('RCP').length !== 1 || byId('INF').length !== 1 || byId('SRC').length !== 1)
    throw new Error('project archive must contain one RCP, INF, and SRC chunk');
  if (byId('OUT').length > 1)
    throw new Error('project archive must not contain more than one OUT chunk');
  let recipe;
  let parsedRecipe;
  try {
    const recipePayload = byId('RCP')[0].payload;
    if (recipePayload.byteLength > MAX_RECIPE_BYTES)
      throw new Error('project recipe exceeds the 4 MiB application limit');
    recipe = textDecoder.decode(recipePayload);
    parsedRecipe = JSON.parse(recipe);
  } catch (error) {
    throw new Error(`project recipe is invalid: ${error instanceof Error ? error.message : error}`);
  }
  const infoChunk = byId('INF')[0];
  if (infoChunk.payload.byteLength > MAX_INFO_BYTES)
    throw new Error('INF chunk exceeds the 64 KiB application limit');
  const info = normalizeInfo(decodeJson(infoChunk.payload, 'project info'));
  const outputChunk = byId('OUT')[0];
  if (outputChunk?.payload.byteLength > MAX_OUTPUT_BYTES)
    throw new Error('OUT chunk exceeds the 16 KiB application limit');
  const outputValue = outputChunk ? decodeJson(outputChunk.payload, 'project output') : null;
  const unsupportedOutput = outputValue && typeof outputValue === 'object'
      && !Array.isArray(outputValue)
      && typeof outputValue.format === 'string'
      && ![
        'mp4_h264', 'webp_animation', 'apng_animation', 'gif_animation', 'png_sequence',
        'png_sprite_sheet', 'tga_sprite_sheet',
      ]
        .includes(outputValue.format)
    ? outputChunk.payload.slice()
    : null;
  const output = outputValue && !unsupportedOutput ? normalizeOutput(outputValue) : null;
  if (['png_sprite_sheet', 'tga_sprite_sheet'].includes(output?.format)
      && output.columns > parsedRecipe?.timeline?.frames)
    throw new Error('project output.columns must not exceed recipe.timeline.frames');
  const source = decodeFile(byId('SRC')[0], 'source', 0);
  const auxiliaryInputs = byId('AST').map((chunk, index) =>
    decodeFile(chunk, 'auxiliary', index));
  const names = new Set([source.name]);
  for (const file of auxiliaryInputs) {
    if (names.has(file.name))
      throw new Error(`duplicate project file ${file.name}`);
    names.add(file.name);
  }
  const optionalChunks = chunks
    .filter((chunk) => !CORE_CHUNK_IDS.has(chunk.id))
    .map((chunk) => ({ id: chunk.id, payload: chunk.payload.slice(), version: chunk.version }));
  return { auxiliaryInputs, info, optionalChunks, output, recipe, source, unsupportedOutput };
}

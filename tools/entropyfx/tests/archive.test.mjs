import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createProjectArchive, openProjectArchive } from '../src/archive.js';

const HEADER_BYTES = 12;
const CHUNK_HEADER_BYTES = 13;
const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

const crcTable = new Uint32Array(256);
for (let index = 0; index < crcTable.length; index++) {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (0xedb88320 & -(value & 1));
  crcTable[index] = value >>> 0;
}

function crc32(parts) {
  let checksum = 0xffffffff;
  for (const part of parts) {
    for (const byte of part)
      checksum = crcTable[(checksum ^ byte) & 0xff] ^ (checksum >>> 8);
  }
  return (checksum ^ 0xffffffff) >>> 0;
}

const recipe = `${JSON.stringify({
  elements: [],
  effectMasks: [],
  key: 'project_fixture',
  output: { height: 40, width: 48 },
  primitives: [{ cycles: 1, intensity: 1, phase: 0, type: 'brightness_pulse', x: 0.5, y: 0.5, radius: 0.2 }],
  schemaVersion: 1,
  seed: 1,
  source: 'source.png',
  timeline: { frameRate: 25, frames: 25 },
}, null, 2)}\n`;

const project = () => ({
  info: {
    author: 'EntropyLogix',
    description: 'Format fixture',
    title: 'Project fixture',
    version: '1.0',
  },
  output: { bitrate: 6000000, format: 'mp4_h264' },
  recipe,
  source: {
    bytes: new Uint8Array([137, 80, 78, 71, 0, 255]),
    mediaType: 'image/png',
    name: 'source.png',
  },
  auxiliaryInputs: [
    {
      bytes: new Uint8Array([82, 73, 70, 70, 1]),
      mediaType: 'image/webp',
      name: 'inputs/depth.webp',
    },
    {
      bytes: new Uint8Array([255, 0, 127, 64]),
      mediaType: 'image/png',
      name: 'inputs/mask.png',
    },
  ],
  optionalChunks: [
    { id: 'EXT', payload: textEncoder.encode('{"text":"draft"}\n'), version: 2 },
  ],
});

function chunks(archive) {
  const result = [];
  let offset = HEADER_BYTES;
  while (offset < archive.byteLength) {
    const view = new DataView(archive.buffer, archive.byteOffset + offset, CHUNK_HEADER_BYTES);
    const size = view.getUint32(5, true);
    result.push({
      end: offset + CHUNK_HEADER_BYTES + size,
      id: textDecoder.decode(archive.subarray(offset, offset + 3)),
      offset,
      payloadOffset: offset + CHUNK_HEADER_BYTES,
      size,
    });
    offset += CHUNK_HEADER_BYTES + size;
  }
  return result;
}

function replaceChunkHeader(archive, chunk, { flags, id, version }) {
  const result = archive.slice();
  const header = result.subarray(chunk.offset, chunk.payloadOffset);
  if (id !== undefined)
    header.set(textEncoder.encode(id), 0);
  if (version !== undefined)
    header[3] = version;
  if (flags !== undefined)
    header[4] = flags;
  const payload = result.subarray(chunk.payloadOffset, chunk.end);
  new DataView(result.buffer).setUint32(chunk.offset + 9,
    crc32([header.subarray(0, 9), payload]), true);
  return result;
}

function withoutChunk(archive, chunk) {
  const result = new Uint8Array(archive.byteLength - (chunk.end - chunk.offset));
  result.set(archive.subarray(0, chunk.offset));
  result.set(archive.subarray(chunk.end), chunk.offset);
  return result;
}

function appendChunk(archive, chunk) {
  const result = new Uint8Array(archive.byteLength + chunk.byteLength);
  result.set(archive);
  result.set(chunk, archive.byteLength);
  return result;
}

test('round-trips a deterministic self-contained chunk project', async () => {
  const first = await createProjectArchive(project());
  const reordered = project();
  reordered.auxiliaryInputs.reverse();
  const second = await createProjectArchive(reordered);
  assert.deepEqual(first, second);
  assert.equal(textDecoder.decode(first.subarray(0, 7)), 'ENTROPY');
  assert.equal(textDecoder.decode(first.subarray(7, 11)), 'ANIM');
  assert.equal(first[11], 1);
  assert.deepEqual(chunks(first).map((chunk) => chunk.id), [
    'RCP', 'INF', 'SRC', 'AST', 'AST', 'OUT', 'EXT',
  ]);

  const opened = await openProjectArchive(first);
  assert.equal(opened.recipe, recipe);
  assert.deepEqual(opened.info, project().info);
  assert.deepEqual(opened.output, project().output);
  assert.equal(opened.source.name, 'source.png');
  assert.deepEqual([...opened.source.bytes], [137, 80, 78, 71, 0, 255]);
  assert.deepEqual(opened.auxiliaryInputs.map((file) => file.name), [
    'inputs/depth.webp',
    'inputs/mask.png',
  ]);
  assert.deepEqual(opened.optionalChunks.map((chunk) => ({
    id: chunk.id, payload: textDecoder.decode(chunk.payload), version: chunk.version,
  })), [{ id: 'EXT', payload: '{"text":"draft"}\n', version: 2 }]);
});

test('supports every output preset and a missing output chunk', async () => {
  for (const output of [
    null,
    { format: 'png_sequence' },
    { columns: 5, format: 'png_sprite_sheet' },
  ]) {
    const archive = await createProjectArchive({ ...project(), output });
    assert.deepEqual((await openProjectArchive(archive)).output, output);
  }
  await assert.rejects(createProjectArchive({
    ...project(), output: { columns: 26, format: 'png_sprite_sheet' },
  }), /must not exceed/);
});

test('opens and preserves a future noncritical output preset without using it', async () => {
  const archive = await createProjectArchive({ ...project(), output: null });
  const outputPayload = textEncoder.encode('{"format":"future_video","quality":7}\n');
  const outputHeader = new Uint8Array(CHUNK_HEADER_BYTES);
  outputHeader.set(textEncoder.encode('OUT'));
  outputHeader[3] = 1;
  new DataView(outputHeader.buffer).setUint32(5, outputPayload.byteLength, true);
  new DataView(outputHeader.buffer).setUint32(9,
    crc32([outputHeader.subarray(0, 9), outputPayload]), true);
  const opened = await openProjectArchive(appendChunk(archive,
    appendChunk(outputHeader, outputPayload)));
  assert.equal(opened.output, null);
  assert.deepEqual(opened.unsupportedOutput, outputPayload);
  const rewritten = await createProjectArchive(opened);
  assert.deepEqual((await openProjectArchive(rewritten)).unsupportedOutput, outputPayload);
});

test('requires the complete project information object', async () => {
  await assert.rejects(createProjectArchive({ ...project(), info: undefined }), /project info/);
  await assert.rejects(createProjectArchive({
    ...project(), info: { author: '', description: '', title: '' },
  }), /version is required/);
  await assert.rejects(createProjectArchive({
    ...project(), info: { ...project().info, timestamp: 'now' },
  }), /timestamp is not allowed/);
});

test('rejects unsafe names and duplicates before writing', async () => {
  await assert.rejects(
    createProjectArchive({ ...project(), source: { ...project().source, name: '../source.png' } }),
    /must not contain.*parent/,
  );
  await assert.rejects(
    createProjectArchive({
      ...project(),
      auxiliaryInputs: [{ ...project().auxiliaryInputs[0], name: 'source.png' }],
    }),
    /duplicate project file source\.png/,
  );
  await assert.rejects(
    createProjectArchive({
      ...project(), optionalChunks: [{ id: 'RCP', payload: new Uint8Array() }],
    }),
    /reserved/,
  );
});

test('rejects truncation, trailing bytes, and modified headers or payloads', async () => {
  const archive = await createProjectArchive(project());
  await assert.rejects(openProjectArchive(archive.subarray(0, 7)), /truncated/);

  const trailing = new Uint8Array(archive.length + 1);
  trailing.set(archive);
  await assert.rejects(openProjectArchive(trailing), /chunk header is truncated/);

  const modifiedPayload = archive.slice();
  modifiedPayload[modifiedPayload.length - 1] ^= 0xff;
  await assert.rejects(openProjectArchive(modifiedPayload), /checksum differs/);

  const modifiedHeader = archive.slice();
  modifiedHeader[HEADER_BYTES + 3] = 2;
  await assert.rejects(openProjectArchive(modifiedHeader), /checksum differs/);
});

test('identifies the ENTROPY product and rejects unsupported development versions', async () => {
  const archive = await createProjectArchive(project());
  const badSignature = archive.slice();
  badSignature[0] = 0;
  await assert.rejects(openProjectArchive(badSignature), /signature is invalid/);

  const badProduct = archive.slice();
  badProduct[7] = 0;
  await assert.rejects(openProjectArchive(badProduct), /product type is not ANIM/);

  const badVersion = archive.slice();
  badVersion[11] = 2;
  await assert.rejects(openProjectArchive(badVersion), /container version is unsupported/);
});

test('preserves unknown optional chunks and rejects unknown critical chunks', async () => {
  const input = project();
  input.optionalChunks = [];
  const archive = await createProjectArchive(input);
  const [asset] = chunks(archive).filter((chunk) => chunk.id === 'AST');
  const extensionBytes = archive.slice(asset.offset, asset.end);
  const extension = {
    end: extensionBytes.byteLength,
    offset: 0,
    payloadOffset: CHUNK_HEADER_BYTES,
  };
  const optional = replaceChunkHeader(extensionBytes, extension, { flags: 0, id: 'EXT' });
  const extended = appendChunk(archive, optional);
  const opened = await openProjectArchive(extended);
  assert.equal(opened.recipe, recipe);
  assert.equal(opened.optionalChunks[0].id, 'EXT');
  const rewritten = await createProjectArchive(opened);
  assert.deepEqual((await openProjectArchive(rewritten)).optionalChunks, opened.optionalChunks);

  const appended = chunks(extended).at(-1);
  const critical = replaceChunkHeader(extended, appended, { flags: 1 });
  await assert.rejects(openProjectArchive(critical), /unknown critical project chunk/);
});

test('rejects unsupported flags and chunk versions after checksum verification', async () => {
  const archive = await createProjectArchive(project());
  const data = chunks(archive).find((chunk) => chunk.id === 'RCP');
  await assert.rejects(openProjectArchive(replaceChunkHeader(archive, data, { flags: 3 })),
    /flags are unsupported/);
  await assert.rejects(openProjectArchive(replaceChunkHeader(archive, data, { version: 2 })),
    /version is unsupported/);
});

test('requires one RCP, INF, and SRC and at most one OUT', async () => {
  const archive = await createProjectArchive(project());
  const parsed = chunks(archive);
  for (const id of ['RCP', 'INF', 'SRC']) {
    const chunk = parsed.find((item) => item.id === id);
    await assert.rejects(openProjectArchive(withoutChunk(archive, chunk)), /one RCP, INF, and SRC/);
  }
  const output = parsed.find((chunk) => chunk.id === 'OUT');
  await assert.rejects(openProjectArchive(appendChunk(
    archive, archive.subarray(output.offset, output.end),
  )), /more than one OUT/);
});

test('enforces application archive, chunk, count, and logical-name limits', async () => {
  await assert.rejects(createProjectArchive({
    ...project(),
    source: { ...project().source, name: `${'a'.repeat(1025)}.png` },
  }), /1024-byte/);
  await assert.rejects(createProjectArchive({
    ...project(),
    source: { ...project().source, mediaType: `image/${'a'.repeat(17000)}` },
  }), /16 KiB/);
  await assert.rejects(createProjectArchive({
    ...project(),
    recipe: `{"value":"${'a'.repeat(4 * 1024 * 1024)}"}`,
  }), /4 MiB/);
  await assert.rejects(createProjectArchive({
    ...project(),
    optionalChunks: Array.from({ length: 1020 }, () => ({
      id: 'EXT', payload: new Uint8Array(), version: 1,
    })),
  }), /1024-chunk/);
  const archive = await createProjectArchive(project());
  const oversized = archive.slice();
  new DataView(oversized.buffer).setUint32(HEADER_BYTES + 5, 134217729, true);
  await assert.rejects(openProjectArchive(oversized), /128 MiB/);
});

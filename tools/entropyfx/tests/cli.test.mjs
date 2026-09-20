import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';

const execute = promisify(execFile);
const root = path.resolve(new URL('..', import.meta.url).pathname);
const tool = path.join(root, 'bin/entropyfx.mjs');

test('packs, validates, inspects, and unpacks one portable project', async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'entropyfx-'));
  try {
    const recipe = JSON.parse(await readFile(path.join(root, 'examples/minimal/recipe.json'), 'utf8'));
    recipe.source = 'source.png';
    recipe.output = { height: 3, width: 4 };
    const recipePath = path.join(temporary, 'recipe.json');
    const sourcePath = path.join(temporary, 'source.png');
    const infoPath = path.join(temporary, 'info.json');
    const outputPath = path.join(temporary, 'output.json');
    const projectPath = path.join(temporary, 'project.entropyfx');
    const unpacked = path.join(temporary, 'unpacked');
    await writeFile(recipePath, `${JSON.stringify(recipe, null, 2)}\n`);
    await writeFile(infoPath, JSON.stringify({
      author: 'EntropyLogix', description: 'CLI fixture', title: 'Minimal', version: '1.0',
    }));
    await writeFile(outputPath, JSON.stringify({ bitrate: 6000000, format: 'mp4_h264' }));
    await writeFile(sourcePath, new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));
    const packed = await execute(process.execPath, [
      tool,
      'pack',
      '--recipe', recipePath,
      '--source', sourcePath,
      '--info', infoPath,
      '--output-settings', outputPath,
      '--out', projectPath,
    ]);
    assert.match(packed.stdout, /^OK:/);
    assert.match((await execute(process.execPath, [tool, 'validate', projectPath])).stdout, /^OK:/);
    const inspected = JSON.parse((await execute(process.execPath,
      [tool, 'inspect', projectPath])).stdout);
    assert.deepEqual(inspected.container, { product: 'ANIM', version: 1 });
    assert.equal(inspected.info.title, 'Minimal');
    assert.deepEqual(inspected.outputSettings, { bitrate: 6000000, format: 'mp4_h264' });
    assert.equal(inspected.recipe.key, 'minimal_pulse');
    assert.equal(inspected.recipe.durationSeconds, 6);
    assert.equal(inspected.recipe.frameRate, 25);
    await execute(process.execPath, [tool, 'unpack', projectPath, '--out', unpacked]);
    assert.deepEqual(await readFile(path.join(unpacked, 'source.png')), await readFile(sourcePath));
    assert.deepEqual(JSON.parse(await readFile(path.join(unpacked, 'recipe.json'), 'utf8')), recipe);
    assert.deepEqual(JSON.parse(await readFile(path.join(unpacked, 'info.json'), 'utf8')),
      JSON.parse(await readFile(infoPath, 'utf8')));
    assert.deepEqual(JSON.parse(await readFile(path.join(unpacked, 'output.json'), 'utf8')),
      JSON.parse(await readFile(outputPath, 'utf8')));
  } finally {
    await rm(temporary, { force: true, recursive: true });
  }
});

test('fails before writing an incomplete project or replacing a target', async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'entropyfx-'));
  try {
    const recipe = JSON.parse(await readFile(path.join(root, 'examples/minimal/recipe.json'), 'utf8'));
    recipe.primitives[0].spriteImage = 'inputs/missing.png';
    const recipePath = path.join(temporary, 'recipe.json');
    const sourcePath = path.join(temporary, 'source.png');
    const projectPath = path.join(temporary, 'project.entropyfx');
    await writeFile(recipePath, `${JSON.stringify(recipe)}\n`);
    await writeFile(sourcePath, new Uint8Array([137, 80, 78, 71]));
    await assert.rejects(execute(process.execPath, [
      tool,
      'pack',
      '--recipe', recipePath,
      '--source', sourcePath,
      '--out', projectPath,
    ]));
    await assert.rejects(readFile(projectPath), /ENOENT/);
    delete recipe.primitives[0].spriteImage;
    await writeFile(recipePath, `${JSON.stringify(recipe)}\n`);
    await execute(process.execPath, [
      tool,
      'pack',
      '--recipe', recipePath,
      '--source', sourcePath,
      '--out', projectPath,
    ]);
    await assert.rejects(execute(process.execPath, [
      tool,
      'pack',
      '--recipe', recipePath,
      '--source', sourcePath,
      '--out', projectPath,
    ]));
  } finally {
    await rm(temporary, { force: true, recursive: true });
  }
});

test('packs a disabled image effect without requiring its optional preserved input', async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'entropyfx-'));
  try {
    const recipe = JSON.parse(await readFile(path.join(root, 'examples/minimal/recipe.json'), 'utf8'));
    const effects = JSON.parse(await readFile(
      path.join(root, '../../contracts/effects-v1.json'), 'utf8',
    ));
    const reveal = structuredClone(
      effects.effects.find((effect) => effect.type === 'layer_reveal').template,
    );
    reveal.enabled = false;
    recipe.primitives = [reveal];
    const recipePath = path.join(temporary, 'recipe.json');
    const sourcePath = path.join(temporary, 'source.png');
    const revealedPath = path.join(temporary, 'revealed.png');
    const withoutInputPath = path.join(temporary, 'without-input.entropyfx');
    const withInputPath = path.join(temporary, 'with-input.entropyfx');
    await writeFile(recipePath, `${JSON.stringify(recipe, null, 2)}\n`);
    await writeFile(sourcePath, new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));
    await writeFile(revealedPath, new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));

    const packedWithoutInput = await execute(process.execPath, [
      tool,
      'pack',
      '--recipe', recipePath,
      '--source', sourcePath,
      '--out', withoutInputPath,
    ]);
    assert.match(packedWithoutInput.stdout, / · 0 input\(s\) · /);
    const withoutInput = JSON.parse((await execute(process.execPath,
      [tool, 'inspect', withoutInputPath])).stdout);
    assert.deepEqual(withoutInput.auxiliaryInputs, []);

    const packedWithInput = await execute(process.execPath, [
      tool,
      'pack',
      '--recipe', recipePath,
      '--source', sourcePath,
      '--input', `${reveal.revealedImage}=${revealedPath}`,
      '--out', withInputPath,
    ]);
    assert.match(packedWithInput.stdout, / · 1 input\(s\) · /);
    const withInput = JSON.parse((await execute(process.execPath,
      [tool, 'inspect', withInputPath])).stdout);
    assert.deepEqual(withInput.auxiliaryInputs.map((input) => input.name),
      [reveal.revealedImage]);
  } finally {
    await rm(temporary, { force: true, recursive: true });
  }
});

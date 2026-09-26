import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { loadContracts } from '../src/contracts.js';
import {
  activeReferencedAuxiliaryInputs,
  parseAndValidateRecipe,
  referencedAuxiliaryInputs,
  validateProjectRecipe,
} from '../src/recipe.js';

const example = (name) => readFile(new URL(`../examples/${name}/recipe.json`, import.meta.url), 'utf8');

test('validates complete public examples and all catalog templates', async () => {
  const contracts = await loadContracts();
  for (const name of ['minimal', 'built-in-sprite'])
    assert.equal(parseAndValidateRecipe(await example(name), contracts.recipeSchemas).schemaVersion, 2);
  for (const effect of contracts.effects.effects) {
    const recipe = JSON.parse(await example('minimal'));
    recipe.primitives = [effect.template];
    assert.equal(parseAndValidateRecipe(JSON.stringify(recipe), contracts.recipeSchemas)
      .primitives[0].type, effect.type);
  }
});

test('selects the frozen v1 schema for existing recipes', async () => {
  const contracts = await loadContracts();
  const recipe = JSON.parse(await example('minimal'));
  recipe.schemaVersion = 1;
  assert.equal(parseAndValidateRecipe(
    JSON.stringify(recipe), contracts.recipeSchemas).schemaVersion, 1);
});

test('accepts v2 composition geometry off-canvas without widening source crops', async () => {
  const contracts = await loadContracts();
  const recipe = JSON.parse(await example('minimal'));
  const shimmer = structuredClone(
    contracts.effects.effects.find((effect) => effect.type === 'shimmer').template);
  shimmer.region = { x: -0.5, y: 1.25, width: 2, height: 0.5 };
  recipe.primitives = [shimmer];
  assert.deepEqual(
    parseAndValidateRecipe(JSON.stringify(recipe), contracts.recipeSchemas)
      .primitives[0].region,
    shimmer.region,
  );

  recipe.effectMasks = [
    { feather: 0, radius: 0.5, shape: 'circle', x: -0.1, y: 0.5 },
    {
      feather: 0,
      region: { x: -0.1, y: 0, width: 0.5, height: 0.5 },
      shape: 'rectangle',
    },
    {
      angle: 0, feather: 0, radiusX: 0.5, radiusY: 0.25,
      shape: 'ellipse', x: 1.1, y: 0.5,
    },
    {
      feather: 0,
      points: [{ x: -0.2, y: 0.2 }, { x: 0.5, y: -0.2 }, { x: 1.2, y: 0.8 }],
      shape: 'lasso',
    },
  ];
  recipe.elements = [
    {
      borderColor: '#ffffff', borderOpacity: 1, borderStyle: 'solid',
      fillColor: '#000000', fillOpacity: 0,
      region: { x: -0.5, y: 0, width: 1, height: 1 },
      thickness: 0.01, type: 'frame',
    },
    {
      angle: 0, fit: 'contain', opacity: 1,
      region: { x: 0.5, y: -0.5, width: 1, height: 1.5 },
      source: 'overlay.png', type: 'image_overlay',
    },
    {
      color: '#ffffff', direction: 'ltr', font: 'builtin:fonts/v1/inter_regular',
      fontSize: 0.1, horizontalAlign: 'center', lineHeight: 1.2, opacity: 1,
      region: { x: 1.1, y: 1.1, width: 0.5, height: 0.5 },
      source: 'text.png', text: 'TEST', type: 'text',
      verticalAlign: 'middle', wrap: 'word',
    },
  ];
  const authored = parseAndValidateRecipe(JSON.stringify(recipe), contracts.recipeSchemas);
  assert.equal(authored.effectMasks.length, 4);
  assert.equal(authored.elements.length, 3);

  const v1 = structuredClone(recipe);
  v1.schemaVersion = 1;
  assert.throws(
    () => parseAndValidateRecipe(JSON.stringify(v1), contracts.recipeSchemas),
    /effectMasks.*must be at least 0|elements.*must be at least 0/,
  );

  recipe.effectMasks = [];
  recipe.elements = [];
  const tiling = structuredClone(
    contracts.effects.effects.find((effect) => effect.type === 'tiling_array').template);
  tiling.region = shimmer.region;
  tiling.tileRegion.x = -0.1;
  recipe.primitives = [tiling];
  assert.throws(
    () => parseAndValidateRecipe(JSON.stringify(recipe), contracts.recipeSchemas),
    /tileRegion.*x.*must be at least 0/,
  );
});

test('rejects missing, unknown, duplicate, and invalid fields', async () => {
  const contracts = await loadContracts();
  const recipe = JSON.parse(await example('minimal'));
  delete recipe.primitives[0].enabled;
  assert.throws(() => parseAndValidateRecipe(JSON.stringify(recipe), contracts.recipeSchemas),
    /enabled.*required/);
  recipe.primitives[0].enabled = true;
  delete recipe.primitives[0].phase;
  assert.throws(() => parseAndValidateRecipe(JSON.stringify(recipe), contracts.recipeSchemas),
    /phase.*required/);
  recipe.primitives[0].phase = 0;
  recipe.primitives[0].unexpected = true;
  assert.throws(() => parseAndValidateRecipe(JSON.stringify(recipe), contracts.recipeSchemas),
    /unexpected.*not allowed/);
  assert.throws(() => parseAndValidateRecipe('{"schemaVersion":1,"schemaVersion":1}',
    contracts.recipeSchemas), /schemaVersion.*duplicated/);
  const outside = JSON.parse(await example('minimal'));
  outside.primitives[0].x = 2;
  assert.throws(() => parseAndValidateRecipe(JSON.stringify(outside), contracts.recipeSchemas),
    /must be at most 1/);
  for (const [cycles, message] of [
    [-2147483649, /cycles.*must be at least -2147483648/],
    [2147483648, /cycles.*must be at most 2147483647/],
  ]) {
    const outsideCycles = JSON.parse(await example('minimal'));
    outsideCycles.primitives[0].cycles = cycles;
    assert.throws(
      () => parseAndValidateRecipe(JSON.stringify(outsideCycles), contracts.recipeSchemas),
      message,
    );
  }
});

test('accepts optional color and source-ray controls from the renderer contract', async () => {
  const contracts = await loadContracts();
  const recipe = JSON.parse(await example('minimal'));
  recipe.primitives = [{
    angle: 151,
    color: '#c9bdd9',
    colorSource: 'custom',
    cycles: 1,
    enabled: true,
    phase: 0.1,
    radius: 1.1,
    intensity: 0.9,
    type: 'ray_fan',
    width: 0.2,
    x: 0.46,
    y: 0.02,
  }];
  assert.equal(parseAndValidateRecipe(JSON.stringify(recipe), contracts.recipeSchemas)
    .primitives[0].color, '#c9bdd9');
  assert.deepEqual(referencedAuxiliaryInputs(recipe), []);

  recipe.primitives = [{
    color: '#ffffff',
    colorSource: 'source_pixels',
    cycles: 1,
    direction: -45,
    enabled: true,
    length: 0.8,
    noise: 0.2,
    phase: 0,
    scale: 4,
    smoothness: 0.1,
    intensity: 1,
    threshold: 0.4,
    type: 'directional_source_rays',
  }];
  assert.equal(parseAndValidateRecipe(JSON.stringify(recipe), contracts.recipeSchemas)
    .primitives[0].direction, -45);
});

test('accepts built-in ASCII styles without auxiliary project inputs', async () => {
  const contracts = await loadContracts();
  const recipe = JSON.parse(await example('minimal'));
  const ascii = structuredClone(
    contracts.effects.effects.find((effect) => effect.type === 'ascii_art').template,
  );
  recipe.primitives = [ascii];
  assert.deepEqual(referencedAuxiliaryInputs(recipe), []);
  assert.equal(parseAndValidateRecipe(JSON.stringify(recipe), contracts.recipeSchemas)
    .primitives[0].characterStyle, 'classic_ascii');

  ascii.glyphAtlasSource = 'inputs/glyphs.png';
  assert.throws(() => parseAndValidateRecipe(JSON.stringify(recipe), contracts.recipeSchemas),
    /glyphAtlasSource.*not allowed/);
});

test('requires exact project inputs and accepts cataloged built-in sprites', async () => {
  const contracts = await loadContracts();
  const spriteRecipe = await example('built-in-sprite');
  const project = {
    auxiliaryInputs: [],
    recipe: spriteRecipe,
    source: { name: 'source.png' },
  };
  assert.equal(validateProjectRecipe(project, contracts).key, 'firefly_field');
  const wrongColumns = JSON.parse(spriteRecipe);
  wrongColumns.primitives[0].sheetColumns = 2;
  assert.throws(
    () => validateProjectRecipe({ ...project, recipe: JSON.stringify(wrongColumns) }, contracts),
    /matches a forbidden shape/,
  );
  const wrongRows = JSON.parse(spriteRecipe);
  wrongRows.primitives[0].sheetRows = 2;
  assert.throws(
    () => validateProjectRecipe({ ...project, recipe: JSON.stringify(wrongRows) }, contracts),
    /matches a forbidden shape/,
  );
  const custom = JSON.parse(spriteRecipe);
  custom.primitives[0].spriteImage = 'inputs/custom.png';
  custom.primitives[0].sheetColumns = 7;
  custom.primitives[0].sheetRows = 3;
  assert.equal(validateProjectRecipe({
    ...project,
    auxiliaryInputs: [{ name: 'inputs/custom.png' }],
    recipe: JSON.stringify(custom),
  }, contracts).primitives[0].sheetColumns, 7);
});

test('validates every nested Sprite morph source', async () => {
  const contracts = await loadContracts();
  const recipe = JSON.parse(await example('minimal'));
  const morph = structuredClone(
    contracts.effects.effects.find((effect) => effect.type === 'sprite_morph').template,
  );
  recipe.primitives = [morph];
  const project = {
    auxiliaryInputs: morph.stages.map((stage) => ({ name: stage.spriteImage })),
    recipe: JSON.stringify(recipe),
    source: { name: 'source.png' },
  };
  assert.deepEqual(
    validateProjectRecipe(project, contracts).primitives[0].stages
      .map((stage) => stage.spriteImage),
    ['sprite.png', 'morph-target.png'],
  );
  assert.throws(
    () => validateProjectRecipe({ ...project, auxiliaryInputs: project.auxiliaryInputs.slice(0, 1) },
      contracts),
    /referenced project input is missing/,
  );

  const builtIn = structuredClone(recipe);
  for (const [index, stage] of builtIn.primitives[0].stages.entries()) {
    stage.spriteImage = index === 0
      ? 'builtin:sprites/v1/jellyfish_sequence'
      : 'builtin:sprites/v1/fish_atlas';
    delete stage.sheetColumns;
    delete stage.sheetRows;
  }
  assert.equal(validateProjectRecipe({
    ...project,
    auxiliaryInputs: [],
    recipe: JSON.stringify(builtIn),
  }, contracts).primitives[0].type, 'sprite_morph');
});

test('validates Sprite morph timing, transition count, and fixed frames', async () => {
  const contracts = await loadContracts();
  const base = JSON.parse(await example('minimal'));
  base.primitives = [structuredClone(
    contracts.effects.effects.find((effect) => effect.type === 'sprite_morph').template,
  )];
  const parseCandidate = (mutate) => {
    const candidate = structuredClone(base);
    mutate(candidate.primitives[0]);
    return parseAndValidateRecipe(JSON.stringify(candidate), contracts.recipeSchemas);
  };

  assert.throws(
    () => parseCandidate((morph) => morph.transitions.pop()),
    /transitions.*must contain 2 transition\(s\) for loop/,
  );
  assert.throws(
    () => parseCandidate((morph) => { morph.playback = 'once_hold'; }),
    /transitions.*must contain 1 transition\(s\) for once_hold/,
  );
  assert.throws(
    () => parseCandidate((morph) => { morph.transitions[1].start = 0.3; }),
    /transitions\[1\]\.start.*must not overlap/,
  );
  assert.throws(
    () => parseCandidate((morph) => {
      morph.transitions[1].start = 0.8;
      morph.transitions[1].duration = 0.3;
    }),
    /transitions\[1\]\.duration.*at or before timeline position 1/,
  );
  assert.equal(parseCandidate((morph) => {
    morph.transitions[0].start = 0.1;
    morph.transitions[0].duration = 0.2;
    morph.transitions[1].start = 0.3;
    morph.transitions[1].duration = 0.7;
  }).primitives[0].type, 'sprite_morph');
  assert.throws(
    () => parseCandidate((morph) => { morph.stages[0].frame = 1; }),
    /stages\[0\]\.frame.*1-cell sprite layout/,
  );

  const builtIn = structuredClone(base);
  const firstStage = builtIn.primitives[0].stages[0];
  firstStage.spriteImage = 'builtin:sprites/v1/jellyfish_sequence';
  delete firstStage.sheetColumns;
  delete firstStage.sheetRows;
  firstStage.frame = 32;
  const secondStage = builtIn.primitives[0].stages[1];
  secondStage.spriteImage = 'builtin:sprites/v1/fish_atlas';
  delete secondStage.sheetColumns;
  delete secondStage.sheetRows;
  assert.throws(
    () => validateProjectRecipe({
      auxiliaryInputs: [],
      recipe: JSON.stringify(builtIn),
      source: { name: 'source.png' },
    }, contracts),
    /stages\[0\]\.frame.*32-cell sprite layout/,
  );
});

test('does not require an auxiliary image owned only by a disabled effect', async () => {
  const contracts = await loadContracts();
  const recipe = JSON.parse(await example('minimal'));
  const reveal = structuredClone(
    contracts.effects.effects.find((effect) => effect.type === 'layer_reveal').template,
  );
  reveal.enabled = false;
  recipe.primitives = [reveal];
  const project = {
    auxiliaryInputs: [],
    recipe: JSON.stringify(recipe),
    source: { name: 'source.png' },
  };
  assert.equal(validateProjectRecipe(project, contracts).primitives[0].enabled, false);
  assert.deepEqual(referencedAuxiliaryInputs(recipe), [reveal.revealedImage]);
  assert.deepEqual(activeReferencedAuxiliaryInputs(recipe), []);
  project.auxiliaryInputs.push({ name: reveal.revealedImage });
  assert.equal(validateProjectRecipe(project, contracts).primitives[0].enabled, false);
  project.auxiliaryInputs = [];
  reveal.enabled = true;
  project.recipe = JSON.stringify(recipe);
  assert.throws(() => validateProjectRecipe(project, contracts),
    /referenced project input is missing/);
});

test('requires an embedded input for every image overlay element', async () => {
  const contracts = await loadContracts();
  const recipe = JSON.parse(await example('minimal'));
  recipe.elements = [{
    angle: 0,
    fit: 'contain',
    opacity: 1,
    region: { height: 0.5, width: 0.5, x: 0.25, y: 0.25 },
    source: 'inputs/logo.png',
    type: 'image_overlay',
  }];
  const project = {
    auxiliaryInputs: [],
    recipe: JSON.stringify(recipe),
    source: { name: 'source.png' },
  };
  assert.throws(() => validateProjectRecipe(project, contracts),
    /referenced project input is missing/);
  project.auxiliaryInputs.push({ name: 'inputs/logo.png' });
  assert.equal(validateProjectRecipe(project, contracts).elements[0].type, 'image_overlay');
});

test('requires the canonical raster embedded for every text element', async () => {
  const contracts = await loadContracts();
  const recipe = JSON.parse(await example('minimal'));
  recipe.elements = [{
    color: '#ffffff',
    direction: 'ltr',
    font: 'builtin:fonts/v1/inconsolata_bold',
    fontSize: 0.08,
    horizontalAlign: 'center',
    lineHeight: 1.2,
    opacity: 1,
    region: { height: 0.2, width: 0.5, x: 0.25, y: 0.4 },
    source: 'generated/text-0001.png',
    text: 'TEXT',
    type: 'text',
    verticalAlign: 'middle',
    wrap: 'word',
  }];
  const project = {
    auxiliaryInputs: [],
    recipe: JSON.stringify(recipe),
    source: { name: 'source.png' },
  };
  assert.throws(() => validateProjectRecipe(project, contracts),
    /referenced project input is missing/);
  project.auxiliaryInputs.push({ name: 'generated/text-0001.png' });
  assert.equal(validateProjectRecipe(project, contracts).elements[0].type, 'text');
});

test('requires both the canonical raster and an explicitly selected custom font', async () => {
  const contracts = await loadContracts();
  const recipe = JSON.parse(await example('minimal'));
  const font = 'inputs/fonts/'
    + '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef-signal.ttf';
  recipe.elements = [{
    color: '#ffffff',
    direction: 'ltr',
    font,
    fontSize: 0.08,
    horizontalAlign: 'center',
    lineHeight: 1.2,
    opacity: 1,
    region: { height: 0.2, width: 0.5, x: 0.25, y: 0.4 },
    source: 'generated/text-0001.png',
    text: 'TEXT',
    type: 'text',
    verticalAlign: 'middle',
    wrap: 'word',
  }];
  const project = {
    auxiliaryInputs: [{ name: 'generated/text-0001.png' }],
    recipe: JSON.stringify(recipe),
    source: { name: 'source.png' },
  };
  assert.throws(() => validateProjectRecipe(project, contracts),
    new RegExp(`${font.replaceAll('.', '\\.')}.*missing`, 'u'));
  project.auxiliaryInputs.push({ name: font });
  assert.equal(validateProjectRecipe(project, contracts).elements[0].font, font);
});

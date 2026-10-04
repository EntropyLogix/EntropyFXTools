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

const payloadKeys = { effect: 'primitive', protected: 'protection', element: 'element' };
function recipeFixture(value) {
  const kinds = { primitives: 'effect', effectMasks: 'protected', elements: 'element' };
  const replace = (kind, values) => {
    const layers = value.layers.filter((layer) => layer.kind !== kind);
    const first = value.layers.findIndex((layer) => layer.kind === kind);
    const next = values.map((entry) => ({
      kind, [payloadKeys[kind]]: structuredClone(entry),
    }));
    layers.splice(first < 0 ? layers.length : first, 0, ...next);
    value.layers = layers;
  };
  return new Proxy(value, {
    get(target, property, receiver) {
      if (property === 'toJSON') {
        return () => {
          const plain = structuredClone(target);
          if (target.schemaVersion === 3) {
            delete plain.primitives;
            delete plain.effectMasks;
            delete plain.elements;
          } else if (target.layers) {
            for (const [field, kind] of Object.entries(kinds))
              plain[field] = (target.layers ?? [])
                .filter((layer) => layer.kind === kind)
                .map((layer) => structuredClone(layer[payloadKeys[kind]]));
            delete plain.layers;
          }
          return plain;
        };
      }
      if (target.schemaVersion === 3 && Object.hasOwn(kinds, property))
        return target.layers.filter((layer) => layer.kind === kinds[property])
          .map((layer) => layer[payloadKeys[kinds[property]]]);
      return Reflect.get(target, property, receiver);
    },
    set(target, property, replacement, receiver) {
      if (property === 'schemaVersion' && target.schemaVersion === 3 && replacement < 3) {
        for (const [field, kind] of Object.entries(kinds))
          target[field] = target.layers.filter((layer) => layer.kind === kind)
            .map((layer) => structuredClone(layer[payloadKeys[kind]]));
        delete target.layers;
      }
      if (target.schemaVersion === 3 && Object.hasOwn(kinds, property)) {
        if (!Array.isArray(replacement))
          throw new TypeError(`${property} must be an array`);
        replace(kinds[property], replacement);
        return true;
      }
      return Reflect.set(target, property, replacement, receiver);
    },
  });
}

const plainRecipe = (recipe) => JSON.parse(JSON.stringify(recipe));

async function exampleRecipe(name) {
  return recipeFixture(JSON.parse(await example(name)));
}

test('validates complete public examples and all catalog templates', async () => {
  const contracts = await loadContracts();
  for (const name of ['minimal', 'built-in-sprite'])
    assert.equal(parseAndValidateRecipe(await example(name), contracts.recipeSchemas).schemaVersion, 3);
  for (const effect of contracts.effects.effects) {
  const recipe = await exampleRecipe('minimal');
    recipe.primitives = [effect.template];
    assert.equal(parseAndValidateRecipe(JSON.stringify(recipe), contracts.recipeSchemas)
      .primitives[0].type, effect.type);
  }
});

test('selects the frozen v1 schema for existing recipes', async () => {
  const contracts = await loadContracts();
  const recipe = await exampleRecipe('minimal');
  recipe.schemaVersion = 1;
  for (const field of ['area', 'width', 'height'])
    delete recipe.primitives[0][field];
  assert.equal(parseAndValidateRecipe(
    JSON.stringify(recipe), contracts.recipeSchemas).schemaVersion, 1);
});

test('validates global-source area sizes separately from optical and emitter parameters', async () => {
  const contracts = await loadContracts();
  for (const [type, field] of [['lens_flare', 'flareScale'],
    ['spotlight', 'lightRadius'], ['fluid', 'emitterRadius']]) {
    const template = contracts.effects.effects.find((effect) => effect.type === type).template;
    assert.equal(template.area, 'global');
    for (const area of ['radial', 'rectangular', 'global']) {
      const recipe = await exampleRecipe('minimal');
      recipe.primitives = [{ ...template, area, x: -0.2, y: 1.3,
        radius: 0.2, width: 0.6, height: 0.4 }];
      assert.deepEqual(parseAndValidateRecipe(JSON.stringify(recipe), contracts.recipeSchemas)
        .primitives[0], recipe.primitives[0]);
    }
    for (const missing of ['area', 'radius', 'width', 'height', field]) {
      const recipe = await exampleRecipe('minimal');
      recipe.primitives = [structuredClone(template)];
      delete recipe.primitives[0][missing];
      assert.throws(() => parseAndValidateRecipe(JSON.stringify(recipe), contracts.recipeSchemas));
    }
    for (const schemaVersion of [1, 2]) {
      const recipe = await exampleRecipe('minimal');
      recipe.schemaVersion = schemaVersion;
      const primitive = { ...template, radius: template[field] };
      for (const removed of ['area', 'width', 'height', field])
        delete primitive[removed];
      recipe.primitives = [primitive];
      assert.equal(parseAndValidateRecipe(JSON.stringify(recipe), contracts.recipeSchemas)
        .primitives[0].radius, template[field]);
      recipe.primitives[0][field] = template[field];
      assert.throws(() => parseAndValidateRecipe(JSON.stringify(recipe), contracts.recipeSchemas));
    }
  }
});

test('validates Local shift flat areas without accepting them in frozen legacy recipes', async () => {
  const contracts = await loadContracts();
  const template = contracts.effects.effects.find((effect) => effect.type === 'local_shift').template;
  for (const area of ['radial', 'rectangular', 'global']) {
    const recipe = await exampleRecipe('minimal');
    const primitive = { ...structuredClone(template), area, x: -0.2, y: 1.3,
      width: 0.7, height: 0.4, radius: 0.2, strength: 2.5, angle: -27 };
    recipe.primitives = [primitive];
    assert.deepEqual(parseAndValidateRecipe(JSON.stringify(recipe), contracts.recipeSchemas)
      .primitives[0], primitive);
  }
  for (const field of ['area', 'x', 'y', 'radius', 'width', 'height']) {
    const recipe = await exampleRecipe('minimal');
    recipe.primitives = [structuredClone(template)];
    delete recipe.primitives[0][field];
    assert.throws(() => parseAndValidateRecipe(JSON.stringify(recipe), contracts.recipeSchemas),
      new RegExp(`${field}.*required`));
  }
  for (const schemaVersion of [1, 2]) {
    const recipe = await exampleRecipe('minimal');
    recipe.schemaVersion = schemaVersion;
    recipe.primitives = [structuredClone(template)];
    for (const field of ['area', 'width', 'height'])
      delete recipe.primitives[0][field];
    assert.equal(parseAndValidateRecipe(JSON.stringify(recipe), contracts.recipeSchemas)
      .primitives[0].type, 'local_shift');
    for (const field of ['area', 'width', 'height']) {
      const invalid = recipeFixture(plainRecipe(recipe));
      invalid.primitives[0][field] = field === 'area' ? 'radial' : 1;
      assert.throws(() => parseAndValidateRecipe(JSON.stringify(invalid), contracts.recipeSchemas),
        new RegExp(field));
    }
  }
});

test('validates pulse area profiles and versioned geometry masking without repairing recipes', async () => {
  const contracts = await loadContracts();
  for (const type of ['brightness_pulse', 'flicker']) {
    const template = contracts.effects.effects.find((effect) => effect.type === type).template;
    for (const area of ['radial', 'rectangular', 'global']) {
      for (const maskMode of ['source', 'geometry']) {
        const recipe = await exampleRecipe('minimal');
        const primitive = { ...structuredClone(template), area, maskMode,
          x: -0.2, y: 1.3, width: 0.7, height: 0.4, radius: 0.2 };
        recipe.primitives = [primitive];
        assert.deepEqual(parseAndValidateRecipe(JSON.stringify(recipe), contracts.recipeSchemas)
          .primitives[0], primitive);
      }
    }
    for (const maskMode of ['radial', 'Geometry', 'shape', '', 1, null]) {
      const recipe = await exampleRecipe('minimal');
      recipe.primitives = [{ ...template, maskMode }];
      assert.throws(() => parseAndValidateRecipe(JSON.stringify(recipe), contracts.recipeSchemas),
        /maskMode/);
    }
    for (const field of ['area', 'x', 'y', 'radius', 'width', 'height', 'maskMode']) {
      const recipe = await exampleRecipe('minimal');
      recipe.primitives = [structuredClone(template)];
      delete recipe.primitives[0][field];
      assert.throws(() => parseAndValidateRecipe(JSON.stringify(recipe), contracts.recipeSchemas),
        new RegExp(`${field}.*required`));
    }
    for (const schemaVersion of [1, 2]) {
      for (const maskMode of ['source', 'radial']) {
        const recipe = await exampleRecipe('minimal');
        recipe.schemaVersion = schemaVersion;
        recipe.primitives[0].type = type;
        recipe.primitives[0].maskMode = maskMode;
        for (const field of ['area', 'width', 'height'])
          delete recipe.primitives[0][field];
        assert.equal(parseAndValidateRecipe(JSON.stringify(recipe), contracts.recipeSchemas)
          .primitives[0].maskMode, maskMode);
        recipe.primitives[0].maskMode = 'geometry';
        assert.throws(() => parseAndValidateRecipe(JSON.stringify(recipe), contracts.recipeSchemas),
          /maskMode/);
      }
    }
  }
});

test('keeps static and animated text in one v3 element contract', async () => {
  const contracts = await loadContracts();
  const recipe = await exampleRecipe('minimal');
  const text = {
    color: '#ffffff', direction: 'ltr', enabled: true,
    font: 'builtin:fonts/v1/inter_regular', fontSize: 0.1,
    horizontalAlign: 'center', lineHeight: 1.2, opacity: 1,
    region: { x: 0, y: 0, width: 1, height: 1 },
    text: 'Hello', type: 'text', verticalAlign: 'middle', wrap: 'word',
  };
  recipe.elements = [text];
  assert.equal(parseAndValidateRecipe(JSON.stringify(recipe), contracts.recipeSchemas)
    .elements[0].type, 'text');
  recipe.elements[0].animation = {
    reveal: { mode: 'typewriter', unit: 'grapheme', start: 0, duration: 1, stagger: 0 },
    entrance: { mode: 'none', start: 0, duration: 1, amount: 0 },
    position: { mode: 'wave', amount: 0.03, cycles: 2, phase: 0 },
    angle: { mode: 'none', start: 0, duration: 1, amount: 8 },
    scale: { mode: 'none', start: 0, duration: 1, amount: 0.12 },
    smear: { mode: 'none', start: 0, duration: 1, amount: 0.1, direction: 0, samples: 4 },
    appearance: { mode: 'none', start: 0, duration: 1, amount: 1, color: '#ffffff' },
    exit: { mode: 'none', start: 0, duration: 1, amount: 1 },
  };
  assert.equal(parseAndValidateRecipe(JSON.stringify(recipe), contracts.recipeSchemas)
    .elements[0].animation.position.mode, 'wave');
  const oldType = { ...recipe.elements[0], type: 'animated_text' };
  recipe.elements = [oldType];
  assert.throws(() => parseAndValidateRecipe(JSON.stringify(recipe), contracts.recipeSchemas),
    /layers.*element|elements/);
  recipe.elements = [{ ...recipe.elements[0], type: 'text' }];
  delete recipe.elements[0].animation.reveal;
  assert.throws(() => parseAndValidateRecipe(JSON.stringify(recipe), contracts.recipeSchemas),
    /animation\.reveal/);
});

test('accepts composition geometry off-canvas without widening source crops', async () => {
  const contracts = await loadContracts();
  const recipe = await exampleRecipe('minimal');
  const shimmer = structuredClone(
    contracts.effects.effects.find((effect) => effect.type === 'shimmer').template);
  Object.assign(shimmer, { x: 0.5, y: 1.5, width: 2, height: 0.5 });
  recipe.primitives = [shimmer];
  assert.deepEqual(
    parseAndValidateRecipe(JSON.stringify(recipe), contracts.recipeSchemas)
      .primitives[0],
    shimmer,
  );

  recipe.effectMasks = [
    {
      allowElements: false, enabled: true, feather: 0, featherFalloff: 'smooth',
      radius: 0.5, shape: 'circle', x: -0.1, y: 0.5,
    },
    {
      allowElements: false, enabled: true, feather: 0, featherFalloff: 'smooth',
      region: { x: -0.1, y: 0, width: 0.5, height: 0.5 },
      shape: 'rectangle',
    },
    {
      allowElements: false, angle: 0, enabled: true, feather: 0,
      featherFalloff: 'smooth',
      radiusX: 0.5, radiusY: 0.25,
      shape: 'ellipse', x: 1.1, y: 0.5,
    },
    {
      allowElements: false, enabled: true, feather: 0, featherFalloff: 'smooth',
      points: [{ x: -0.2, y: 0.2 }, { x: 0.5, y: -0.2 }, { x: 1.2, y: 0.8 }],
      shape: 'lasso',
    },
  ];
  recipe.elements = [
    {
      borderColor: '#ffffff', borderOpacity: 1, borderStyle: 'solid',
      enabled: true, fillColor: '#000000', fillOpacity: 0,
      region: { x: -0.5, y: 0, width: 1, height: 1 },
      thickness: 0.01, type: 'frame',
    },
    {
      angle: 0, enabled: true, fit: 'contain', opacity: 1,
      region: { x: 0.5, y: -0.5, width: 1, height: 1.5 },
      source: 'overlay.png', type: 'image_overlay',
    },
    {
      color: '#ffffff', direction: 'ltr', enabled: true,
      font: 'builtin:fonts/v1/inter_regular',
      fontSize: 0.1, horizontalAlign: 'center', lineHeight: 1.2, opacity: 1,
      region: { x: 1.1, y: 1.1, width: 0.5, height: 0.5 },
      text: 'TEST', type: 'text',
      verticalAlign: 'middle', wrap: 'word',
    },
  ];
  const authored = parseAndValidateRecipe(JSON.stringify(recipe), contracts.recipeSchemas);
  assert.equal(authored.effectMasks.length, 4);
  assert.equal(authored.elements.length, 3);

  const v1 = recipeFixture(plainRecipe(recipe));
  v1.schemaVersion = 1;
  v1.primitives[0] = {
    ...shimmer, region: { x: -0.5, y: 1.25, width: 2, height: 0.5 },
    width: shimmer.bandWidth,
  };
  for (const field of ['area', 'x', 'y', 'height', 'radius', 'bandWidth'])
    delete v1.primitives[0][field];
  for (const mask of v1.effectMasks) {
    delete mask.enabled;
    delete mask.allowElements;
  }
  for (const element of v1.elements)
    delete element.enabled;
  assert.throws(
    () => parseAndValidateRecipe(JSON.stringify(v1), contracts.recipeSchemas),
    /effectMasks.*must be at least 0|elements.*must be at least 0|featherFalloff.*not allowed/,
  );

  recipe.effectMasks = [];
  recipe.elements = [];
  const tiling = structuredClone(
    contracts.effects.effects.find((effect) => effect.type === 'tiling_array').template);
  Object.assign(tiling, { x: shimmer.x, y: shimmer.y,
    width: shimmer.width, height: shimmer.height });
  tiling.tileRegion.x = -0.1;
  recipe.primitives = [tiling];
  assert.throws(
    () => parseAndValidateRecipe(JSON.stringify(recipe), contracts.recipeSchemas),
    /tileRegion.*x.*must be at least 0/,
  );
});

test('rejects missing, unknown, duplicate, and invalid fields', async () => {
  const contracts = await loadContracts();
  const recipe = await exampleRecipe('minimal');
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
  const outside = await exampleRecipe('minimal');
  outside.primitives[0].x = 32768;
  assert.throws(() => parseAndValidateRecipe(JSON.stringify(outside), contracts.recipeSchemas),
    /must be at most 32767/);
  for (const [cycles, message] of [
    [-2147483649, /cycles.*must be at least -2147483648/],
    [2147483648, /cycles.*must be at most 2147483647/],
  ]) {
    const outsideCycles = await exampleRecipe('minimal');
    outsideCycles.primitives[0].cycles = cycles;
    assert.throws(
      () => parseAndValidateRecipe(JSON.stringify(outsideCycles), contracts.recipeSchemas),
      message,
    );
  }
});

test('accepts optional color and source-ray controls from the renderer contract', async () => {
  const contracts = await loadContracts();
  const recipe = await exampleRecipe('minimal');
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
    area: 'global',
    x: 0.5, y: 0.5, radius: 0.25, width: 1, height: 1,
  }];
  assert.equal(parseAndValidateRecipe(JSON.stringify(recipe), contracts.recipeSchemas)
    .primitives[0].direction, -45);
});

test('accepts built-in ASCII styles without auxiliary project inputs', async () => {
  const contracts = await loadContracts();
  const recipe = await exampleRecipe('minimal');
  const ascii = structuredClone(
    contracts.effects.effects.find((effect) => effect.type === 'ascii_art').template,
  );
  recipe.primitives = [ascii];
  assert.deepEqual(referencedAuxiliaryInputs(recipe), []);
  assert.equal(parseAndValidateRecipe(JSON.stringify(recipe), contracts.recipeSchemas)
    .primitives[0].characterStyle, 'classic_ascii');

  recipe.primitives[0].glyphAtlasSource = 'inputs/glyphs.png';
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
  const wrongColumns = recipeFixture(JSON.parse(spriteRecipe));
  wrongColumns.primitives[0].sheetColumns = 2;
  assert.throws(
    () => validateProjectRecipe({ ...project, recipe: JSON.stringify(wrongColumns) }, contracts),
    /matches a forbidden shape/,
  );
  const wrongRows = recipeFixture(JSON.parse(spriteRecipe));
  wrongRows.primitives[0].sheetRows = 2;
  assert.throws(
    () => validateProjectRecipe({ ...project, recipe: JSON.stringify(wrongRows) }, contracts),
    /matches a forbidden shape/,
  );
  const custom = recipeFixture(JSON.parse(spriteRecipe));
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
  const recipe = await exampleRecipe('minimal');
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

  const builtIn = recipeFixture(plainRecipe(recipe));
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
  const base = await exampleRecipe('minimal');
  base.primitives = [structuredClone(
    contracts.effects.effects.find((effect) => effect.type === 'sprite_morph').template,
  )];
  const parseCandidate = (mutate) => {
    const candidate = recipeFixture(plainRecipe(base));
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

  const builtIn = recipeFixture(plainRecipe(base));
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

test('validates complete Sprite FX stacks and their timeline envelopes', async () => {
  const contracts = await loadContracts();
  const base = await exampleRecipe('minimal');
  const layer = structuredClone(
    contracts.effects.effects.find((effect) => effect.type === 'sprite_layer').template,
  );
  layer.spriteImage = 'builtin:sprites/v1/jellyfish_sequence';
  delete layer.sheetColumns;
  delete layer.sheetRows;
  layer.spriteEffects = [
    {
      color: '#ffffff', duration: 0.2, easing: 'smoothstep', enabled: true,
      intensity: 1, playback: 'once_hold', start: 0.1, type: 'color_flash',
    },
    {
      color: '#00ffff', duration: 1, easing: 'linear', enabled: true,
      intensity: 0.8, playback: 'ping_pong', softness: 2, start: 0,
      type: 'outline_glow', width: 1,
    },
    {
      duration: 0.5, easing: 'ease_out', enabled: true, endOpacity: 0,
      fragmentSize: 2, front: 'radial_out', frontAngle: 0, gravity: 8,
      gravityAngle: 90, playback: 'once_hold', seed: 7,
      sourceMode: 'capture_at_start', speed: 12, spread: 30, start: 0.5,
      type: 'disintegration',
    },
  ];
  base.primitives = [layer];
  assert.equal(
    parseAndValidateRecipe(JSON.stringify(base), contracts.recipeSchemas)
      .primitives[0].spriteEffects.length,
    3,
  );
  base.primitives[0].spriteEffects[0].duration = 1;
  assert.throws(
    () => parseAndValidateRecipe(JSON.stringify(base), contracts.recipeSchemas),
    /spriteEffects\[0\]\.duration.*timeline position 1/,
  );
});

test('does not require an auxiliary image owned only by a disabled effect', async () => {
  const contracts = await loadContracts();
  const recipe = await exampleRecipe('minimal');
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
  recipe.primitives[0].enabled = true;
  project.recipe = JSON.stringify(recipe);
  assert.throws(() => validateProjectRecipe(project, contracts),
    /referenced project input is missing/);
});

test('requires an embedded input for every image overlay element', async () => {
  const contracts = await loadContracts();
  const recipe = await exampleRecipe('minimal');
  recipe.elements = [{
    angle: 0,
    enabled: true,
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
  recipe.elements[0].enabled = false;
  project.recipe = JSON.stringify(recipe);
  assert.deepEqual(referencedAuxiliaryInputs(recipe), ['inputs/logo.png']);
  assert.deepEqual(activeReferencedAuxiliaryInputs(recipe), []);
  assert.equal(validateProjectRecipe(project, contracts).elements[0].enabled, false);
  recipe.elements[0].enabled = true;
  project.recipe = JSON.stringify(recipe);
  project.auxiliaryInputs.push({ name: 'inputs/logo.png' });
  assert.equal(validateProjectRecipe(project, contracts).elements[0].type, 'image_overlay');
});

test('validates semantic text without an auxiliary raster', async () => {
  const contracts = await loadContracts();
  const recipe = await exampleRecipe('minimal');
  recipe.elements = [{
    color: '#ffffff',
    direction: 'ltr',
    enabled: true,
    font: 'builtin:fonts/v1/inconsolata_bold',
    fontSize: 0.08,
    horizontalAlign: 'center',
    lineHeight: 1.2,
    opacity: 1,
    outline: { color: '#000000', width: 2 },
    region: { height: 0.2, width: 0.5, x: 0.25, y: 0.4 },
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
  assert.equal(validateProjectRecipe(project, contracts).elements[0].type, 'text');
  recipe.elements[0].source = 'generated/text-0001.png';
  project.recipe = JSON.stringify(recipe);
  assert.throws(() => validateProjectRecipe(project, contracts), /additional|source/u);
});

test('published v2 text still requires its embedded raster', async () => {
  const contracts = await loadContracts();
  const recipe = await exampleRecipe('minimal');
  recipe.schemaVersion = 2;
  for (const field of ['area', 'width', 'height'])
    delete recipe.primitives[0][field];
  recipe.elements = [{
    color: '#ffffff', direction: 'ltr',
    font: 'builtin:fonts/v1/inter_regular', fontSize: 0.1,
    horizontalAlign: 'center', lineHeight: 1.2, opacity: 1,
    region: { x: 0, y: 0, width: 1, height: 1 },
    source: 'generated/text-0001.png', text: 'TEXT', type: 'text',
    verticalAlign: 'middle', wrap: 'word',
  }];
  const project = {
    auxiliaryInputs: [], recipe: JSON.stringify(recipe), source: { name: 'source.png' },
  };
  assert.throws(() => validateProjectRecipe(project, contracts), /referenced project input is missing/u);
  project.auxiliaryInputs.push({ name: 'generated/text-0001.png' });
  assert.equal(validateProjectRecipe(project, contracts).elements[0].type, 'text');
});

test('requires an explicitly selected custom text font without a generated raster', async () => {
  const contracts = await loadContracts();
  const recipe = await exampleRecipe('minimal');
  const font = 'inputs/fonts/'
    + '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef-signal.ttf';
  recipe.elements = [{
    color: '#ffffff',
    direction: 'ltr',
    enabled: true,
    font,
    fontSize: 0.08,
    horizontalAlign: 'center',
    lineHeight: 1.2,
    opacity: 1,
    region: { height: 0.2, width: 0.5, x: 0.25, y: 0.4 },
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
    new RegExp(`${font.replaceAll('.', '\\.')}.*missing`, 'u'));
  project.auxiliaryInputs.push({ name: font });
  assert.equal(validateProjectRecipe(project, contracts).elements[0].font, font);
});

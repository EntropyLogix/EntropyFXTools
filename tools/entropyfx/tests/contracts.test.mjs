import assert from 'node:assert/strict';
import { test } from 'node:test';

import { loadContracts } from '../src/contracts.js';

test('ships versioned recipe schemas and unique effect and sprite catalogs', async () => {
  const contracts = await loadContracts();
  const recipeSchema = contracts.recipeSchemas.get(2);
  assert.equal(contracts.effects.formatVersion, 1);
  assert.equal(contracts.sprites.formatVersion, 1);
  assert.equal(contracts.effects.effects.length, 123);
  assert.deepEqual([...contracts.recipeSchemas.keys()], [1, 2]);
  assert.equal(contracts.sprites.sprites.length, 110);
  assert.equal(new Set(contracts.effects.effects.map((effect) => effect.type)).size, 123);
  assert.equal(new Set(contracts.sprites.sprites.map((sprite) => sprite.id)).size, 110);
  assert.equal(recipeSchema.properties.primitives.items.oneOf.length, 123);
  assert.equal(recipeSchema.properties.elements.items.oneOf.length, 5);
  const spriteParticles = contracts.effects.effects.find(
    (effect) => effect.type === 'sprite_particles');
  assert.equal(spriteParticles.template.particleCount, 8);
  assert.equal('density' in spriteParticles.template, false);
  assert.equal(spriteParticles.template.frameSelection, 'random_per_particle');
  assert.equal(spriteParticles.template.sheetColumns, 2);
  assert.equal(spriteParticles.template.sheetRows, 1);
  assert.equal('atlasColumns' in spriteParticles.template, false);
  assert.equal(
    contracts.sprites.sprites[0].id,
    'builtin:sprites/v1/jellyfish_sequence',
  );
  assert.deepEqual(
    contracts.sprites.sprites[0].sheet,
    {
      columns: 8,
      frames: 32,
      gutterPixels: 8,
      kind: 'sequence',
      recommendedFrameSelection: 'particle_age',
      rows: 4,
    },
  );
  const mainControls = { intensity: 0, mix: 0, opacity: 0, strength: 0 };
  for (const [index, effect] of contracts.effects.effects.entries()) {
    assert.ok(effect.mainControl in mainControls, `${effect.type} has an unknown main control`);
    mainControls[effect.mainControl] += 1;
    assert.equal(typeof effect.template[effect.mainControl], 'number');
    const schema = recipeSchema.properties.primitives.items.oneOf[index];
    const variants = schema.oneOf ?? [schema];
    for (const variant of variants) {
      assert.ok(variant.properties[effect.mainControl],
        `${effect.type} schema omits its main control`);
      assert.ok(variant.required.includes(effect.mainControl),
        `${effect.type} schema does not require its main control`);
    }
  }
  assert.deepEqual(mainControls, { intensity: 44, mix: 32, opacity: 16, strength: 31 });
});

test('uses role-based image fields throughout the public effect contract', async () => {
  const contracts = await loadContracts();
  const effects = new Map(contracts.effects.effects.map((effect) => [effect.type, effect]));
  const expected = new Map([
    ['bokeh', ['depthMap', 'centerOpening']],
    ['color_lut', ['lutImage', 'colorsPerAxis', 'sliceColumns', 'sliceRows']],
    ['depth_fog', ['depthMap']],
    ['flow_blur', ['motionMap']],
    ['image_ribbon', ['ribbonImage']],
    ['image_transition', ['targetImage', 'transitionMap', 'returnMap']],
    ['layer_reveal', ['revealedImage']],
    ['masked_lighting', ['lightMask', 'unlitImage']],
    ['parallax', ['depthMap', 'depthDirection', 'stationaryDepth']],
    ['spotlight', ['shapeImage']],
    ['sprite_layer', ['spriteImage']],
    ['sprite_particles', ['spriteImage']],
    ['tiling_array', ['tileImage']],
  ]);
  for (const [type, fields] of expected) {
    const template = effects.get(type).template;
    for (const field of fields)
      assert.ok(field in template, `${type}.${field} is missing`);
  }
  assert.deepEqual(
    effects.get('sprite_morph').template.stages.map((stage) => stage.spriteImage),
    ['sprite.png', 'morph-target.png'],
  );
  for (const stage of effects.get('sprite_morph').template.stages) {
    assert.equal(stage.frameMode, 'fixed_frame');
    assert.equal('playback' in stage, false);
    assert.equal('cycles' in stage, false);
    assert.equal('phase' in stage, false);
  }
});

test('uses reviewed advanced effect field names', async () => {
  const contracts = await loadContracts();
  const effects = new Map(contracts.effects.effects.map((effect) => [effect.type, effect]));
  const grading = effects.get('color_grading').template;
  const breakup = effects.get('signal_breakup').template;
  for (const field of [
    'redOutputMix', 'greenOutputMix', 'blueOutputMix',
    'redFromRed', 'redFromGreen', 'redFromBlue',
    'greenFromRed', 'greenFromGreen', 'greenFromBlue',
    'blueFromRed', 'blueFromGreen', 'blueFromBlue',
    'redOffset', 'greenOffset', 'blueOffset',
  ])
    assert.ok(field in grading, `color_grading.${field} is missing`);
  for (const field of [
    'warpAmount', 'warpBiasX', 'warpBiasY', 'faultDisplacement',
    'primaryFaultFrequency', 'primaryFaultSharpness',
    'secondaryFaultFrequency', 'secondaryFaultSharpness',
    'interlaceAmount', 'horizontalInterlace', 'verticalInterlace',
  ])
    assert.ok(field in breakup, `signal_breakup.${field} is missing`);
});

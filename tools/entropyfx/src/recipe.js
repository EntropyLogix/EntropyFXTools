import { validateProjectPath } from './archive.js';

const auxiliarySourceFields = new Set([
  'depthMap',
  'lightMask',
  'lutImage',
  'motionMap',
  'revealedImage',
  'returnMap',
  'ribbonImage',
  'shapeImage',
  'spriteImage',
  'targetImage',
  'tileImage',
  'transitionMap',
  'unlitImage',
]);

function fail(path, message) {
  throw new Error(`${path}: ${message}`);
}

function valueType(value) {
  if (Array.isArray(value))
    return 'array';
  if (value === null)
    return 'null';
  if (Number.isInteger(value))
    return 'integer';
  return typeof value;
}

function matchesType(value, type) {
  if (type === 'array')
    return Array.isArray(value);
  if (type === 'object')
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  if (type === 'integer')
    return Number.isSafeInteger(value);
  if (type === 'number')
    return typeof value === 'number' && Number.isFinite(value);
  return typeof value === type;
}

function selectedAlternative(value, alternatives) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const discriminator = value.type ?? value.shape;
    if (typeof discriminator === 'string') {
      const match = alternatives.find((candidate) =>
        Object.values(candidate.properties ?? {}).some((property) => property.const === discriminator));
      if (match)
        return match;
    }
  }
  return undefined;
}

export function validateAgainstSchema(value, schema, path = 'recipe') {
  if (schema.not) {
    let matches = true;
    try {
      validateAgainstSchema(value, schema.not, path);
    } catch {
      matches = false;
    }
    if (matches)
      fail(path, 'matches a forbidden shape');
  }
  if (schema.anyOf) {
    const matches = schema.anyOf.some((candidate) => {
      try {
        validateAgainstSchema(value, candidate, path);
        return true;
      } catch {
        return false;
      }
    });
    if (!matches)
      fail(path, 'does not match any allowed shape');
  }
  if (schema.allOf) {
    for (const candidate of schema.allOf)
      validateAgainstSchema(value, candidate, path);
  }
  if (schema.if) {
    let matches = true;
    try {
      validateAgainstSchema(value, schema.if, path);
    } catch {
      matches = false;
    }
    if (matches && schema.then)
      validateAgainstSchema(value, schema.then, path);
    if (!matches && schema.else)
      validateAgainstSchema(value, schema.else, path);
  }
  if (schema.oneOf) {
    const selected = selectedAlternative(value, schema.oneOf);
    if (selected) {
      validateAgainstSchema(value, selected, path);
      return;
    }
    const matches = [];
    for (const candidate of schema.oneOf) {
      try {
        validateAgainstSchema(value, candidate, path);
        matches.push(candidate);
      } catch {
      }
    }
    if (matches.length !== 1)
      fail(path, 'does not match exactly one allowed shape');
    return;
  }
  if ('const' in schema && value !== schema.const)
    fail(path, `must equal ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(value))
    fail(path, `must be one of ${schema.enum.join(', ')}`);
  if (schema.type && !matchesType(value, schema.type))
    fail(path, `must be ${schema.type}; received ${valueType(value)}`);
  if (typeof value === 'string'
      && (schema.type === 'string' || schema.minLength !== undefined || schema.pattern)) {
    if (schema.minLength !== undefined && value.length < schema.minLength)
      fail(path, `must contain at least ${schema.minLength} character(s)`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value))
      fail(path, `must match ${schema.pattern}`);
  }
  if (schema.type === 'number' || schema.type === 'integer') {
    if (schema.minimum !== undefined && value < schema.minimum)
      fail(path, `must be at least ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum)
      fail(path, `must be at most ${schema.maximum}`);
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum)
      fail(path, `must be greater than ${schema.exclusiveMinimum}`);
    if (schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum)
      fail(path, `must be less than ${schema.exclusiveMaximum}`);
  }
  if (schema.type === 'array') {
    for (let index = 0; index < value.length; index++)
      validateAgainstSchema(value[index], schema.items, `${path}[${index}]`);
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)
      && (schema.type === 'object' || schema.required || schema.properties
        || schema.additionalProperties !== undefined)) {
    for (const required of schema.required ?? []) {
      if (!(required in value))
        fail(`${path}.${required}`, 'is required');
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in (schema.properties ?? {})))
          fail(`${path}.${key}`, 'is not allowed');
      }
    }
    for (const [key, property] of Object.entries(schema.properties ?? {})) {
      if (key in value)
        validateAgainstSchema(value[key], property, `${path}.${key}`);
    }
  }
}

function skipWhitespace(state) {
  while (/\s/.test(state.text[state.index] ?? ''))
    state.index++;
}

function scanString(state) {
  const start = state.index;
  state.index++;
  while (state.index < state.text.length) {
    const character = state.text[state.index++];
    if (character === '"')
      return JSON.parse(state.text.slice(start, state.index));
    if (character !== '\\')
      continue;
    if (state.text[state.index] === 'u')
      state.index += 5;
    else
      state.index++;
  }
  fail('recipe', 'contains an unterminated string');
}

function scanPrimitive(state) {
  const match = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/
    .exec(state.text.slice(state.index));
  if (!match)
    fail('recipe', `contains invalid JSON at byte ${state.index}`);
  state.index += match[0].length;
}

function scanValue(state, path) {
  skipWhitespace(state);
  const character = state.text[state.index];
  if (character === '"') {
    scanString(state);
    return;
  }
  if (character === '[') {
    state.index++;
    skipWhitespace(state);
    let index = 0;
    if (state.text[state.index] === ']') {
      state.index++;
      return;
    }
    while (true) {
      scanValue(state, `${path}[${index++}]`);
      skipWhitespace(state);
      if (state.text[state.index] === ']') {
        state.index++;
        return;
      }
      if (state.text[state.index++] !== ',')
        fail('recipe', `contains invalid JSON at byte ${state.index - 1}`);
    }
  }
  if (character === '{') {
    state.index++;
    skipWhitespace(state);
    const keys = new Set();
    if (state.text[state.index] === '}') {
      state.index++;
      return;
    }
    while (true) {
      skipWhitespace(state);
      if (state.text[state.index] !== '"')
        fail('recipe', `contains invalid JSON at byte ${state.index}`);
      const key = scanString(state);
      if (keys.has(key))
        fail(`${path}.${key}`, 'is duplicated');
      keys.add(key);
      skipWhitespace(state);
      if (state.text[state.index++] !== ':')
        fail('recipe', `contains invalid JSON at byte ${state.index - 1}`);
      scanValue(state, `${path}.${key}`);
      skipWhitespace(state);
      if (state.text[state.index] === '}') {
        state.index++;
        return;
      }
      if (state.text[state.index++] !== ',')
        fail('recipe', `contains invalid JSON at byte ${state.index - 1}`);
    }
  }
  scanPrimitive(state);
}

function rejectDuplicateKeys(text) {
  const state = { index: 0, text };
  scanValue(state, 'recipe');
  skipWhitespace(state);
  if (state.index !== text.length)
    fail('recipe', `contains trailing input at byte ${state.index}`);
}

function validateRegions(value, schemaVersion, path = 'recipe') {
  if (!value || typeof value !== 'object')
    return;
  if (!Array.isArray(value)
      && ['x', 'y', 'width', 'height'].every((key) => typeof value[key] === 'number')) {
    const compositionRegion = schemaVersion >= 2
      && (/^recipe\.(?:primitives|elements)\[\d+\]\.region$/u.test(path)
        || /^recipe\.effectMasks\[\d+\]\.region$/u.test(path));
    if (!compositionRegion) {
      if (value.x + value.width > 1)
        fail(path, 'x plus width must not exceed 1');
      if (value.y + value.height > 1)
        fail(path, 'y plus height must not exceed 1');
    }
  }
  for (const [key, child] of Object.entries(value))
    validateRegions(
      child,
      schemaVersion,
      Array.isArray(value) ? `${path}[${key}]` : `${path}.${key}`,
    );
}

const spriteMorphTimingEpsilon = 1e-9;

function validateSpriteMorphFrame(stage, path, columns, rows) {
  if (stage.frameMode !== 'fixed_frame')
    return;
  const frameCount = columns * rows;
  if (stage.frame >= frameCount)
    fail(`${path}.frame`, `must be less than the ${frameCount}-cell sprite layout`);
}

function validateSpriteMorphSemantics(recipe) {
  for (const [primitiveIndex, primitive] of recipe.primitives.entries()) {
    if (primitive.type !== 'sprite_morph')
      continue;
    const path = `recipe.primitives[${primitiveIndex}]`;
    const requiredTransitions = primitive.playback === 'loop'
      ? primitive.stages.length : primitive.stages.length - 1;
    if (primitive.transitions.length !== requiredTransitions) {
      fail(`${path}.transitions`,
        `must contain ${requiredTransitions} transition(s) for ${primitive.playback}`);
    }
    let previousEnd = 0;
    for (const [transitionIndex, transition] of primitive.transitions.entries()) {
      const transitionPath = `${path}.transitions[${transitionIndex}]`;
      const end = transition.start + transition.duration;
      if (transition.start + spriteMorphTimingEpsilon < previousEnd)
        fail(`${transitionPath}.start`, 'must not overlap the previous transition');
      if (end > 1 + spriteMorphTimingEpsilon)
        fail(`${transitionPath}.duration`, 'must end at or before timeline position 1');
      previousEnd = end;
    }
    for (const [stageIndex, stage] of primitive.stages.entries()) {
      if (Number.isInteger(stage.sheetColumns) && Number.isInteger(stage.sheetRows)) {
        validateSpriteMorphFrame(
          stage, `${path}.stages[${stageIndex}]`, stage.sheetColumns, stage.sheetRows);
      }
    }
  }
}

function validateSpriteEffectSemantics(recipe) {
  for (const [primitiveIndex, primitive] of recipe.primitives.entries()) {
    if (!Array.isArray(primitive.spriteEffects))
      continue;
    for (const [effectIndex, effect] of primitive.spriteEffects.entries()) {
      if (effect.start + effect.duration > 1 + spriteMorphTimingEpsilon) {
        fail(
          `recipe.primitives[${primitiveIndex}].spriteEffects[${effectIndex}].duration`,
          'must end at or before timeline position 1',
        );
      }
    }
  }
}

export function parseAndValidateRecipe(text, recipeSchemas) {
  if (typeof text !== 'string')
    throw new Error('recipe text is required');
  rejectDuplicateKeys(text);
  let recipe;
  try {
    recipe = JSON.parse(text);
  } catch (error) {
    throw new Error(`recipe is invalid JSON: ${error instanceof Error ? error.message : error}`);
  }
  const recipeSchema = recipeSchemas.get(recipe?.schemaVersion);
  if (!recipeSchema)
    fail('recipe.schemaVersion', 'is not supported');
  validateAgainstSchema(recipe, recipeSchema);
  validateProjectPath(recipe.source, 'recipe source');
  validateRegions(recipe, recipe.schemaVersion);
  validateSpriteMorphSemantics(recipe);
  validateSpriteEffectSemantics(recipe);
  return recipe;
}

function collectReferencedAuxiliaryInputs(recipe, activeEffectsOnly) {
  const names = new Set();
  const visit = (value, field = '') => {
    if (typeof value === 'string' && auxiliarySourceFields.has(field)) {
      if (value.length > 0)
        names.add(value);
      return;
    }
    if (!value || typeof value !== 'object')
      return;
    for (const [key, child] of Object.entries(value))
      visit(child, key);
  };
  for (const primitive of recipe.primitives) {
    if (!activeEffectsOnly || primitive.enabled)
      visit(primitive);
  }
  for (const element of recipe.elements) {
    visit(element);
    if (element.type === 'text'
        && typeof element.font === 'string' && element.font.startsWith('inputs/fonts/')) {
      names.add(element.font);
    }
    if (['image_overlay', 'text'].includes(element.type) && typeof element.source === 'string'
        && element.source.length > 0) {
      names.add(element.source);
    }
  }
  return [...names].sort();
}

export function referencedAuxiliaryInputs(recipe) {
  return collectReferencedAuxiliaryInputs(recipe, false);
}

export function activeReferencedAuxiliaryInputs(recipe) {
  return collectReferencedAuxiliaryInputs(recipe, true);
}

export function validateProjectRecipe(project, contracts) {
  const recipe = parseAndValidateRecipe(project.recipe, contracts.recipeSchemas);
  if (recipe.source !== project.source.name)
    throw new Error(`recipe.source ${recipe.source} does not match project source ${project.source.name}`);
  if (['png_sprite_sheet', 'tga_sprite_sheet'].includes(project.output?.format)
      && project.output.columns > recipe.timeline.frames)
    throw new Error('project output columns must not exceed the recipe frame count');
  const available = new Set(project.auxiliaryInputs.map((input) => input.name));
  const builtInSprites = new Map(
    contracts.sprites.sprites.map((sprite) => [sprite.id, sprite]));
  const builtIns = new Set(builtInSprites.keys());
  const referenced = referencedAuxiliaryInputs(recipe);
  const active = activeReferencedAuxiliaryInputs(recipe);
  for (const name of referenced) {
    if (name.startsWith('builtin:')) {
      if (!builtIns.has(name))
        throw new Error(`${name}: built-in sprite is not in the public catalog`);
    } else if (active.includes(name) && !available.has(name)) {
      throw new Error(`${name}: referenced project input is missing`);
    }
  }
  const embedded = new Set(referenced.filter((name) => !name.startsWith('builtin:')));
  for (const name of available) {
    if (!embedded.has(name))
      throw new Error(`${name}: project input is not referenced by the recipe`);
  }
  for (const [primitiveIndex, primitive] of recipe.primitives.entries()) {
    if (primitive.type !== 'sprite_morph')
      continue;
    for (const [stageIndex, stage] of primitive.stages.entries()) {
      const sprite = builtInSprites.get(stage.spriteImage);
      if (sprite) {
        validateSpriteMorphFrame(
          stage,
          `recipe.primitives[${primitiveIndex}].stages[${stageIndex}]`,
          sprite.sheet.columns,
          sprite.sheet.rows,
        );
      }
    }
  }
  return recipe;
}

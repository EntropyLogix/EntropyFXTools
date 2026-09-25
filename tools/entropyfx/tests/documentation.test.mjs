import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { loadContracts } from '../src/contracts.js';
import { referencedAuxiliaryInputs } from '../src/recipe.js';

const root = new URL('../../../', import.meta.url);

async function read(relative) {
  return readFile(new URL(relative, root), 'utf8');
}

function section(text, heading, nextHeading) {
  const start = text.indexOf(heading);
  assert.notEqual(start, -1, `${heading} is missing`);
  const end = text.indexOf(nextHeading, start + heading.length);
  assert.notEqual(end, -1, `${nextHeading} is missing after ${heading}`);
  return text.slice(start + heading.length, end);
}

function codeNames(text) {
  return [...new Set([...text.matchAll(/`([A-Za-z][A-Za-z0-9.]*)`/g)]
    .map((match) => match[1]))].sort();
}

function contractImageFields(contracts) {
  const replaceStrings = (value) => {
    for (const [field, child] of Object.entries(value)) {
      if (typeof child === 'string')
        value[field] = `inputs/${field}/contract.png`;
      else if (child && typeof child === 'object')
        replaceStrings(child);
    }
  };
  const primitives = contracts.effects.effects.map((effect) => {
    const primitive = structuredClone(effect.template);
    replaceStrings(primitive);
    return primitive;
  });
  return [...new Set(referencedAuxiliaryInputs({ elements: [], primitives })
    .map((name) => name.split('/')[1]))].sort();
}

function conditionalEffectFields(contracts) {
  const fields = [];
  for (const entry of contracts.recipeSchemas.get(2).properties.primitives.items.oneOf) {
    if (!entry.oneOf || entry.oneOf.length < 2)
      continue;
    const type = entry.oneOf[0].properties.type.const;
    const common = new Set(Object.keys(entry.oneOf[0].properties));
    for (const variant of entry.oneOf.slice(1)) {
      for (const field of common) {
        if (!(field in variant.properties))
          common.delete(field);
      }
    }
    const union = new Set(entry.oneOf.flatMap((variant) => Object.keys(variant.properties)));
    for (const field of union) {
      if (!common.has(field))
        fields.push(`${type}.${field}`);
    }
  }
  return fields.sort();
}

test('documents the image fields and conditional controls from the public contract', async () => {
  const contracts = await loadContracts();
  const documentation = await read('docs/image-animation.md');
  const conditional = section(
    documentation,
    'Structurally conditional version-2 fields include:',
    'They belong to the `bokeh` variant',
  );
  const images = section(
    documentation,
    'The complete version-2 set is:',
    'A user-owned value in one of these fields',
  );
  assert.deepEqual(codeNames(conditional), conditionalEffectFields(contracts));
  assert.deepEqual(codeNames(images), contractImageFields(contracts));
  assert.doesNotMatch(documentation, /Fields ending in `Source`|optional authored controls/);
  assert.doesNotMatch(documentation, /atlas contract/);
});

test('keeps the repository overview on the role-based image workflow', async () => {
  const overview = await read('README.md');
  assert.match(overview, /role-based image field/);
  assert.match(overview, /\[image animation guide\]\(docs\/image-animation\.md\)/);
  assert.doesNotMatch(
    overview,
    /fields ending in `Source`|optional authored (?:controls|parameters)|atlas contract/i,
  );
});

test('keeps every agent instruction on the role-based image workflow', async () => {
  const files = [
    'tools/entropyfx/agents/claude/entropyfx-image-animation.md',
    'tools/entropyfx/agents/codex/entropyfx-image-animation/SKILL.md',
    'tools/entropyfx/agents/gemini/entropyfx-image-animation/SKILL.md',
  ];
  for (const file of files) {
    const instruction = await read(file);
    assert.match(instruction, /Use images and sprites/);
    assert.match(instruction, /built-in Sprite Sheet/);
    assert.match(instruction, /exact logical project path/);
    assert.doesNotMatch(instruction, /\*Source|ending in `Source`|atlas contract/);
    assert.doesNotMatch(instruction, /optional authored controls/);
  }
});

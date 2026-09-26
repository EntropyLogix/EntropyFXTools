import { readFile } from 'node:fs/promises';

const contractRoot = new URL('../../../contracts/', import.meta.url);

async function readJson(name) {
  return JSON.parse(await readFile(new URL(name, contractRoot), 'utf8'));
}

let loaded;

export async function loadContracts() {
  loaded ??= Promise.all([
    readJson('effects-v1.json'),
    readJson('recipe-v1.schema.json'),
    readJson('recipe-v2.schema.json'),
    readJson('recipe-v3.schema.json'),
    readJson('sprites-v1.json'),
  ]).then(([effects, recipeV1, recipeV2, recipeV3, sprites]) => ({
    effects,
    recipeSchemas: new Map([[1, recipeV1], [2, recipeV2], [3, recipeV3]]),
    sprites,
  }));
  return loaded;
}

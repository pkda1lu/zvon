const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const THREE = require('three');

// Load the actual procedural geometry in Node; no renderer or browser is needed.
const previousLoader = require.extensions['.ts'];
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText, filename);
const { buildAward } = require('../src/components/awardGeometry.ts');
if (previousLoader) require.extensions['.ts'] = previousLoader;
else delete require.extensions['.ts'];

for (const model of ['trophy', 'medal', 'crystal', 'rose', 'star', 'bell']) {
  test(`${model} has finite renderable geometry and fits the shared camera`, () => {
    const root = buildAward(THREE, model, '#8b8dff', 'rose', 'polished');
    root.updateMatrixWorld(true);
    let meshes = 0;
    root.traverse(part => {
      if (!part.geometry) return;
      meshes++;
      for (const value of part.geometry.getAttribute('position').array) assert.ok(Number.isFinite(value));
      const normal = part.geometry.getAttribute('normal');
      if (normal) for (const value of normal.array) assert.ok(Number.isFinite(value));
    });
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    assert.ok(meshes >= 10);
    assert.ok(size.y > 1.5 && size.y < 2.8, `height ${size.y}`);
    assert.ok(size.x < 2.8 && size.z < 2.8);
    if (model === 'rose') assert.ok(meshes >= 40, 'individual petals and foliage are retained');
    if (model === 'bell') { let swing = false; root.traverse(part => { swing ||= !!part.userData.awardSwing; }); assert.ok(swing); }
    root.traverse(part => { part.geometry?.dispose(); part.material?.dispose(); });
  });
}

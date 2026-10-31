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
const { awardRenderSize } = require('../src/components/awardRenderSize.ts');
if (previousLoader) require.extensions['.ts'] = previousLoader;
else delete require.extensions['.ts'];

test('large views and high DPI render at native resolution with a bounded buffer', () => {
  assert.deepEqual(awardRenderSize(640, 640, 2), { width: 1280, height: 1280 });
  assert.deepEqual(awardRenderSize(640, 640, 3), { width: 1920, height: 1920 });
  assert.deepEqual(awardRenderSize(1600, 800, 3), { width: 2048, height: 1024 });
  assert.deepEqual(awardRenderSize(190, 190, 1), { width: 285, height: 285 });
});

test('medal uses microstructure maps and sufficiently sampled bevels', () => {
  const medal = buildAward(THREE, 'medal', '#8b8dff', 'ice', 'polished');
  let mapped = 0, bevelled = 0;
  medal.traverse(part => {
    if (part.material?.normalMap && part.material?.roughnessMap) {
      mapped++;
      assert.equal(part.material.normalMap.image.width, 256);
      assert.ok(part.geometry.getAttribute('uv'));
    }
    if (part.geometry?.parameters?.options?.bevelSegments >= 10) bevelled++;
  });
  assert.ok(mapped >= 4); assert.ok(bevelled >= 4);
});

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

test('rose petals and leaves have closed rims, thickness and UVs', () => {
  const rose = buildAward(THREE, 'rose', '#ffffff', 'rose');
  let petals = 0, leaves = 0;
  rose.traverse(part => {
    if (part.name === 'rose-solid-petal') petals++;
    if (part.name === 'rose-curved-leaf') leaves++;
    if (!part.geometry?.userData.closedSheet) return;
    assert.ok(part.geometry.getAttribute('uv'));
    const edges = new Map(), index = part.geometry.index.array;
    for (let i = 0; i < index.length; i += 3) for (const [a,b] of [[index[i],index[i+1]],[index[i+1],index[i+2]],[index[i+2],index[i]]]) {
      const key = a < b ? `${a}:${b}` : `${b}:${a}`; edges.set(key, (edges.get(key) || 0) + 1);
    }
    assert.ok([...edges.values()].every(count => count === 2), 'every sheet edge has two adjacent faces');
  });
  assert.equal(petals, 26); assert.equal(leaves, 2);
});

test('star has a connected stand and its inlays belong to the actual orbit', () => {
  const star = buildAward(THREE, 'star', '#ffffff', 'amber'); star.updateMatrixWorld(true);
  const frame = star.getObjectByName('star-rounded-frame'), stand = star.getObjectByName('star-connected-stand');
  const hits = new THREE.Raycaster(new THREE.Vector3(0, -0.9, 0), new THREE.Vector3(0, 1, 0)).intersectObject(frame);
  assert.ok(hits.length);
  assert.ok(new THREE.Box3().setFromObject(stand).max.y >= hits[0].point.y, 'stand meets the central underside');
  const orbit = star.getObjectByName('star-orbit');
  const inlays = orbit.children.filter(child => child.name === 'star-orbit-inlay');
  assert.equal(inlays.length, 3);
  for (const inlay of inlays) assert.ok(Math.abs(Math.hypot(inlay.position.x, inlay.position.y) - 0.9) < 1e-6);
});

test('crystal has real chamfers and setting prongs instead of wireframe edges', () => {
  const crystal = buildAward(THREE, 'crystal', '#ffffff', 'ice');
  const glass = crystal.getObjectByName('crystal-bevelled-glass');
  assert.equal(glass.geometry.parameters.options.bevelSegments, 10);
  assert.ok(glass.material.transmission > 0.9);
  assert.ok(crystal.getObjectByName('crystal-polished-facets').geometry.drawRange.count > 0);
  let lines = 0, prongs = 0;
  crystal.traverse(part => { if (part.isLineSegments) lines++; if (part.name === 'crystal-setting-prong') prongs++; });
  assert.equal(lines, 0); assert.equal(prongs, 2);
});

test('cup and bell reliefs have interior tessellation to follow their curved shells', () => {
  for (const model of ['trophy', 'bell']) {
    const root = buildAward(THREE, model, '#ffffff', 'cobalt');
    let relief;
    root.traverse(part => { if (part.geometry?.userData.conformedRelief) relief = part; });
    assert.ok(relief);
    const pos = relief.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i += 3) {
      const a = new THREE.Vector3().fromBufferAttribute(pos,i), b = new THREE.Vector3().fromBufferAttribute(pos,i+1), c = new THREE.Vector3().fromBufferAttribute(pos,i+2);
      assert.ok(Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a)) < 0.06);
    }
  }
});

test('bell clapper keeps clearance above the foot while retaining its swing pivot', () => {
  const bell = buildAward(THREE, 'bell', '#ffffff', 'cobalt'); bell.updateMatrixWorld(true);
  const clapper = bell.getObjectByName('bell-rounded-clapper'), foot = bell.getObjectByName('bell-foot');
  assert.ok(clapper.parent.userData.awardSwing);
  for (const angle of [-0.07, 0, 0.07]) {
    clapper.parent.rotation.z = angle; bell.updateMatrixWorld(true);
    assert.ok(new THREE.Box3().setFromObject(clapper).min.y > new THREE.Box3().setFromObject(foot).max.y + 0.05);
  }
});

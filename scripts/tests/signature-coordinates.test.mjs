import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadService } from '../lib/subscription-reliability-workloads.mjs';
const { signaturePoint } = loadService('src/utils/signatureCoordinates.ts', {});
test('signature mapping inverts centered SVG meet at multiple sizes, letterbox offsets and edges without clipping', () => {
  for (const [width, height] of [[320,180],[520,292.5],[240,135],[520,180],[180,320],[640,360]]) {
    const scale=Math.min(width/320,height/180), left=(width-320*scale)/2, top=(height-180*scale)/2;
    for (const [x,y] of [[1,1],[319,179],[160,90],[20,170]]) {
      const point=signaturePoint(width,height,left+x*scale,top+y*scale);
      assert.ok(Math.abs(point.x-x)<1e-9); assert.ok(Math.abs(point.y-y)<1e-9);
    }
    assert.deepEqual(signaturePoint(width,height,-100,-100),{x:1,y:1});
    assert.deepEqual(signaturePoint(width,height,width+100,height+100),{x:319,y:179});
  }
  assert.equal(signaturePoint(0,180,20,20),null); assert.equal(signaturePoint(320,NaN,20,20),null);
});

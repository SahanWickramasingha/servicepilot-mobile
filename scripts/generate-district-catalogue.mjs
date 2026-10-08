// Derive lightweight metadata from the existing licensed geometry; never substitute GPS.
import { readFileSync, writeFileSync } from 'node:fs';
const directory = new URL('../functions/src/domain/', import.meta.url);
const source = JSON.parse(readFileSync(new URL('district-boundaries.json', directory), 'utf8'));
const districts = source.features.map(({ name: rawName, geometry }) => {
  const name = rawName.replace(/ District$/, '');
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const points = polygons.flatMap((polygon) => polygon.flat());
  return { id: name.toLowerCase().replace(/\s+/g, '-'), name,
    bounds: [Math.min(...points.map((p) => p[1])), Math.min(...points.map((p) => p[0])),
      Math.max(...points.map((p) => p[1])), Math.max(...points.map((p) => p[0]))] };
}).sort((a, b) => a.name.localeCompare(b.name));
const output = JSON.stringify(districts, null, 2) + '\n';
const target = new URL('district-catalogue.json', directory);
if (process.argv.includes('--check')) {
  if (readFileSync(target, 'utf8').replace(/\r\n/g, '\n') !== output) throw new Error('District metadata needs regeneration');
  console.log('District metadata matches all 25 source geometries');
} else { writeFileSync(target, output); console.log('Generated lightweight district metadata'); }

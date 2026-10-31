// Generate Rules' equivalent of the shared TypeScript catalogue. Local files only.
import { readFileSync, writeFileSync } from 'node:fs';
import { loadService } from './lib/subscription-reliability-workloads.mjs';
const { SERVICE_CATEGORY_DEFINITIONS: categories } = loadService('functions/src/domain/serviceCategories.ts', {});
const literal = value => JSON.stringify(value);
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
const patterns = categories.map(category => '\\s*(' + [...new Set([category.id, category.label, ...category.aliases].map(value => value.toLowerCase()))].map(escape).join('|') + ')\\s*');
const block = `    // BEGIN GENERATED SERVICE CATEGORIES (scripts/generate-service-category-rules.mjs)
    function validServiceCategoryId(id) {
      return id in ${JSON.stringify(categories.map(category => category.id))};
    }
    function serviceCategoryLabel(id) {
      return ${categories.map(category => `id == ${literal(category.id)} ? ${literal(category.label)} :`).join('\n        ')} "";
    }
    function serviceCategoryIdForValue(value) {
      let label = value is string ? value.lower() : "";
      return ${categories.map((category, i) => `label.matches(${literal(patterns[i])}) ? ${literal(category.id)} :`).join('\n        ')} "";
    }
    function technicianCategoryId(profile) {
      let id = profile.get("serviceCategoryId", "");
      let raw = profile.get("specialization", "");
      let explicit = serviceCategoryIdForValue(profile.get("serviceCategory", ""));
      let legacy = serviceCategoryIdForValue(raw);
      let legacyPresent = raw is string ? !raw.matches("\\\\s*") : true;
      return id != "" ? (validServiceCategoryId(id) ? id : "") :
        (legacyPresent && legacy == "" || explicit != "" && legacy != "" && explicit != legacy) ? "" :
        explicit != "" ? explicit : legacy;
    }
    function validSelectedTechnicianCategory(profile) {
      let id = profile.get("serviceCategoryId", "");
      return validServiceCategoryId(id) && profile.specialization == serviceCategoryLabel(id);
    }
    function mapCategory(profile) { return serviceCategoryLabel(technicianCategoryId(profile)); }
    // END GENERATED SERVICE CATEGORIES`;
const path = 'firestore.rules', source = readFileSync(path, 'utf8');
const existing = /    \/\/ BEGIN GENERATED SERVICE CATEGORIES[\s\S]*?    \/\/ END GENERATED SERVICE CATEGORIES/;
const legacy = /    function mapCategory\(profile\) \{[\s\S]*?\n    \}/;
const actual = source.match(existing)?.[0];
if (process.argv.includes('--write')) writeFileSync(path, source.replace(actual ? existing : legacy, () => block));
else if (actual !== block) { console.error('Service category Rules are stale. Run node scripts/generate-service-category-rules.mjs --write'); process.exitCode = 1; }
else console.log('Shared category catalogue and generated Firestore Rules match.');

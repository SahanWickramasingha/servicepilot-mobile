import { lifecycleWorkload, directoryWorkload, reviewResumeWorkload } from './lib/subscription-reliability-workloads.mjs';
const root = process.argv[2] ?? '.';
console.log(JSON.stringify({ source: root, ...await lifecycleWorkload(root), ...await directoryWorkload(root), ...reviewResumeWorkload(root) }, null, 2));

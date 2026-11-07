import { customerMountWorkload, jobsRenderWorkload, directoryPagingWorkload } from './lib/mobile-navigation-workloads.mjs';
const root = process.argv[2] ?? '.';
console.log(JSON.stringify({ source: root, ...customerMountWorkload(root), ...jobsRenderWorkload(root), ...directoryPagingWorkload(root) }, null, 2));

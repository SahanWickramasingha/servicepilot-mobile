import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
const legal = JSON.parse(readFileSync('functions/src/domain/legal-content.json', 'utf8'));
const check = process.argv.includes('--check');
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const directory = 'public/legal';
if (!check) mkdirSync(directory, { recursive: true });
const deletion = `mailto:${legal.email}?subject=${encodeURIComponent('ServicePilot Account Deletion Request')}&body=${encodeURIComponent('I request deletion of my ServicePilot account and associated data.\nAccount role: \nI will send from my registered email where possible. Please explain verification, deletion scope and justified retention. I will not include passwords, tokens, private keys or unnecessary ID documents.')}`;
let failed = false;
for (const [key, document] of Object.entries(legal.documents)) {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'"><title>${escape(document.title)} | ServicePilot</title>
<style>body{margin:0;background:#06101d;color:#dbe5f2;font:17px/1.7 system-ui,sans-serif}main{max-width:780px;margin:auto;padding:32px 22px 60px}nav{display:flex;flex-wrap:wrap;gap:18px}a{color:#7dbaff}header{margin:36px 0}img{width:80px;height:80px}h1,h2{color:#f8fafc;line-height:1.3}h1{font-size:2.1rem}h2{font-size:1.25rem;margin-top:32px}section{margin-bottom:28px}button{font:inherit;padding:10px 16px;background:#17263a;color:#fff;border:1px solid #7dbaff;border-radius:8px;cursor:pointer}.contact{padding:22px;border:1px solid #334155;border-radius:12px;overflow-wrap:anywhere}footer{margin-top:32px;font-size:.85rem}</style></head><body><main>
<nav aria-label="ServicePilot policies">${Object.entries(legal.documents).map(([id, value]) => `<a href="${id}.html"${key === id ? ' aria-current="page"' : ''}>${escape(value.title)}</a>`).join('')}</nav>
<header><img src="servicepilot-logo.png" alt="ServicePilot logo"><h1>${escape(document.title)}</h1><p>Owner / Developer: ${escape(legal.owner)}<br>Effective ${legal.effectiveDate} · Terms ${legal.termsVersion} · Privacy ${legal.privacyPolicyVersion}</p></header>
${document.sections.map(section => `<section><h2>${escape(section.heading)}</h2><p>${escape(section.text)}</p></section>`).join('\n')}
<aside class="contact"><h2>${key === 'deletion' ? 'Request deletion without the app' : 'Contact ServicePilot'}</h2><p><a href="${escape(key === 'deletion' ? deletion : `mailto:${legal.email}`)}">${key === 'deletion' ? 'Open deletion-request email' : 'Email support'}</a></p><p>Email: <span id="email">${escape(legal.email)}</span></p><button id="copy-email" type="button">Copy email address</button><p id="contact-status" role="status">Opening your composer does not submit a request. Review and send the email yourself.</p><p><a href="${legal.phoneLink}">${legal.phone}</a> · <a href="${legal.linkedIn}" rel="noopener noreferrer">LinkedIn — ${escape(legal.owner)}</a></p></aside>
<footer>${escape(legal.copyright)} Third-party licenses and user-content rights remain applicable.</footer></main><script src="contact.js" defer></script></body></html>\n`;
  const path = `${directory}/${key}.html`;
  if (check) { if (!existsSync(path) || readFileSync(path, 'utf8') !== html) { console.error(`FAIL ${path} is stale`); failed = true; } }
  else writeFileSync(path, html);
}
const logo = 'assets/images/servicepilot-logo.png';
if (check) { if (!existsSync(`${directory}/servicepilot-logo.png`) || !readFileSync(logo).equals(readFileSync(`${directory}/servicepilot-logo.png`))) failed = true; }
else copyFileSync(logo, `${directory}/servicepilot-logo.png`);
if (failed) process.exitCode = 1; else console.log('PASS shared/versioned legal HTML and existing logo');

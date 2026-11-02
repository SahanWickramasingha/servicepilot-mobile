document.getElementById('copy-email').addEventListener('click', async () => {
  const element = document.getElementById('email');
  const status = document.getElementById('contact-status');
  try { await navigator.clipboard.writeText(element.textContent); status.textContent = 'Email address copied. No request has been sent.'; }
  catch { const selection = window.getSelection(); if (selection) { selection.removeAllRanges(); const range = document.createRange(); range.selectNodeContents(element); selection.addRange(range); } status.textContent = 'Copy unavailable. Select and copy the email address, then send using your mail app or webmail. No request has been sent.'; }
});

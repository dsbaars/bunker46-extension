/**
 * Redirect page for nostrconnect:// URIs.
 * Open with ?uri=<encoded-nostrconnect-uri>; reads useBunker46 and bunker46BaseUrl from storage.
 * Only redirects when "Use bunker46" is enabled.
 */

const params = new URLSearchParams(window.location.search);
const uri = params.get('uri') || params.get('nostrconnect') || '';

function showMessage(text: string): void {
  document.body.innerHTML = '';
  const p = document.createElement('p');
  p.textContent = text;
  document.body.append(p);
}

if (!uri) {
  showMessage('Missing ?uri= parameter.');
} else {
  chrome.storage.local.get(
    ['useBunker46', 'bunker46BaseUrl'],
    (data: { useBunker46?: boolean; bunker46BaseUrl?: string }) => {
      if (data.useBunker46 !== true) {
        showMessage(
          'Enable "Use bunker46" in the extension Settings to handle nostrconnect links.'
        );
        return;
      }
      const baseUrl = (data.bunker46BaseUrl as string) || 'http://localhost:5173';
      const base = baseUrl.replace(/\/+$/, '');
      const target = `${base}/connections?import=${encodeURIComponent(uri)}`;
      window.location.href = target;
    }
  );
}

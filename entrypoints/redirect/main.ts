/**
 * Redirect page for nostrconnect:// URIs.
 * Open with ?uri=<encoded-nostrconnect-uri>; reads bunker46BaseUrl from storage
 * and redirects to {baseUrl}/connections?import={uri}.
 */

const params = new URLSearchParams(window.location.search);
const uri = params.get('uri') || params.get('nostrconnect') || '';

if (!uri) {
  const p = document.createElement('p');
  p.append(
    document.createTextNode('Missing '),
    Object.assign(document.createElement('code'), { textContent: '?uri=' }),
    document.createTextNode(' parameter.')
  );
  document.body.append(p);
} else {
  chrome.storage.local.get('bunker46BaseUrl', (data: { bunker46BaseUrl?: string }) => {
    const baseUrl = (data.bunker46BaseUrl as string) || 'http://localhost:5173';
    const base = baseUrl.replace(/\/+$/, '');
    const target = `${base}/connections?import=${encodeURIComponent(uri)}`;
    window.location.href = target;
  });
}

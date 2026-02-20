/**
 * Redirect page for nostrconnect:// URIs.
 * Open with ?uri=<encoded-nostrconnect-uri>; reads bunker46BaseUrl from storage
 * and redirects to {baseUrl}/connections?import={uri}.
 */

const params = new URLSearchParams(window.location.search);
const uri = params.get('uri') || params.get('nostrconnect') || '';

if (!uri) {
  document.body.innerHTML = '<p>Missing <code>?uri=</code> parameter.</p>';
} else {
  chrome.storage.local.get('bunker46BaseUrl', (data: { bunker46BaseUrl?: string }) => {
    const baseUrl = (data.bunker46BaseUrl as string) || 'http://localhost:5173';
    const base = baseUrl.replace(/\/+$/, '');
    const target = `${base}/connections?import=${encodeURIComponent(uri)}`;
    window.location.href = target;
  });
}

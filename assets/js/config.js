/**
 * Fashion Teller site configuration. The only file you edit to go live.
 *
 * apiBaseUrl   empty  -> the studio runs on built-in sample data (no backend needed)
 *              set    -> e.g. "https://api.fashionteller.com"; the Django backend must allow
 *                        this site's origin in CORS (django-cors-headers, CORS_ALLOWED_ORIGINS)
 * formEndpoint empty  -> tailor applications and contact messages are kept in the visitor's browser
 *              set    -> any endpoint that accepts a JSON POST (your own API, Formspree, a Vercel function)
 */
window.FT_CONFIG = {
  apiBaseUrl: '',
  apiPrefix: '/api/v1',
  designId: 'sample',
  formEndpoint: '',
};

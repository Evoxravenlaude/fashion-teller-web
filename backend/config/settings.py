"""Fashion Teller API settings. Everything that differs between machines comes from the environment (.env.example)."""
import os
from datetime import timedelta
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
env = os.environ.get
flag = lambda k, d='0': env(k, d).strip().lower() in ('1', 'true', 'yes', 'on')
csv = lambda k, d='': [x.strip() for x in env(k, d).split(',') if x.strip()]

# Off unless asked for. manage.py turns it on by itself on a machine with no DJANGO_SECRET_KEY (local work); a server never gets it by accident.
DEBUG = flag('DJANGO_DEBUG', '0')
SECRET_KEY = env('DJANGO_SECRET_KEY') or ('dev-only-not-for-production-' + 'x' * 40 if DEBUG else None)
if not SECRET_KEY:
    raise RuntimeError('Set DJANGO_SECRET_KEY (see backend/.env.example).')
ALLOWED_HOSTS = csv('ALLOWED_HOSTS', 'localhost,127.0.0.1,[::1]' if DEBUG else '')

INSTALLED_APPS = [
    'django.contrib.auth', 'django.contrib.contenttypes', 'django.contrib.staticfiles',
    'corsheaders', 'rest_framework', 'core',
]
MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]
try:
    import whitenoise  # noqa: F401  (serves /static in production; optional in development)
    MIDDLEWARE.insert(1, 'whitenoise.middleware.WhiteNoiseMiddleware')
except ImportError:
    pass
ROOT_URLCONF = 'config.urls'
X_FRAME_OPTIONS = 'DENY'
# No cookies are used for sign-in (tokens travel in the Authorization header), so there is no session for CSRF to protect.
SILENCED_SYSTEM_CHECKS = ['security.W003']
WSGI_APPLICATION = 'config.wsgi.application'
TEMPLATES = [{'BACKEND': 'django.template.backends.django.DjangoTemplates', 'DIRS': [], 'APP_DIRS': True, 'OPTIONS': {'context_processors': []}}]

# SQLite for development. Emails and payouts are sent from background threads that also write here, so writers queue
# for the lock (IMMEDIATE) rather than failing with "database is locked", and readers are not blocked meanwhile (WAL).
DATABASES = {'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': env('SQLITE_PATH') or BASE_DIR / 'db.sqlite3',
                         'OPTIONS': {'timeout': 20, 'transaction_mode': 'IMMEDIATE', 'init_command': 'PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;'}}}
if env('DATABASE_URL'):
    import dj_database_url
    DATABASES['default'] = dj_database_url.parse(env('DATABASE_URL'), conn_max_age=60)
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
AUTH_USER_MODEL = 'core.User'
AUTH_PASSWORD_VALIDATORS = [{'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator', 'OPTIONS': {'min_length': 8}}]

LANGUAGE_CODE = 'en-ng'
TIME_ZONE = env('TIME_ZONE', 'Africa/Lagos')   # the day a streak counts for
USE_TZ = True
STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
APPEND_SLASH = False

# The site is a separate origin (Vercel); only the origins listed here may call the API from a browser.
CORS_ALLOWED_ORIGINS = csv('CORS_ORIGINS', 'http://localhost:8787,http://127.0.0.1:8787,http://localhost:3000,http://localhost:5173' if DEBUG else '')
CORS_ALLOW_CREDENTIALS = False                    # tokens travel in the Authorization header, never in cookies
DATA_UPLOAD_MAX_MEMORY_SIZE = 9 * 1024 * 1024      # a photoreal try-on sends a photo and a garment picture; everything else is far smaller

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': ['rest_framework_simplejwt.authentication.JWTAuthentication'],
    'DEFAULT_PERMISSION_CLASSES': ['rest_framework.permissions.AllowAny'],     # each view states who may call it (core/views.py)
    'DEFAULT_RENDERER_CLASSES': ['rest_framework.renderers.JSONRenderer'],
    'DEFAULT_PARSER_CLASSES': ['rest_framework.parsers.JSONParser'],
    'DEFAULT_THROTTLE_CLASSES': ['rest_framework.throttling.AnonRateThrottle', 'rest_framework.throttling.UserRateThrottle'],
    'DEFAULT_THROTTLE_RATES': {'anon': env('THROTTLE_ANON', '240/min'), 'user': env('THROTTLE_USER', '900/min'), 'auth': env('THROTTLE_AUTH', '20/min'), 'write': env('THROTTLE_WRITE', '120/min')},
    'EXCEPTION_HANDLER': 'core.api.on_error',
    'UNAUTHENTICATED_USER': None,
}
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=30),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=30),
    'ROTATE_REFRESH_TOKENS': False,
    'UPDATE_LAST_LOGIN': False,
}
CACHES = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}

if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
    SECURE_SSL_REDIRECT = flag('SECURE_SSL_REDIRECT', '1')
    SECURE_HSTS_SECONDS = 31536000
    SECURE_CONTENT_TYPE_NOSNIFF = True

# ── product settings ──
PAYSTACK_SECRET_KEY = env('PAYSTACK_SECRET_KEY', '')
PAYMENTS_LIVE = bool(PAYSTACK_SECRET_KEY)
# The built-in test checkout marks payments as paid without moving money. Never on in production unless asked for by name.
ALLOW_TEST_PAYMENTS = flag('ALLOW_TEST_PAYMENTS', '1' if DEBUG else '0')
DEPOSIT_PERCENT = int(env('DEPOSIT_PERCENT', '50'))
SAMPLE_MODE = flag('SAMPLE_MODE', '1' if DEBUG else '0')
SAMPLE_QUOTE_DELAY = tuple(float(x) for x in csv('SAMPLE_QUOTE_DELAY', '2,9'))[:2]
SAMPLE_PHASE_SECONDS = float(env('SAMPLE_PHASE_SECONDS', '30'))
LOGGING = {'version': 1, 'disable_existing_loggers': False, 'handlers': {'console': {'class': 'logging.StreamHandler'}}, 'root': {'handlers': ['console'], 'level': 'WARNING'}}

# ───────── email ─────────
# Sent over plain SMTP, which every provider offers (Resend, Postmark, Amazon SES, Brevo, Mailgun…), so changing
# provider is a change of these settings only. With no EMAIL_HOST: development prints emails to the console and
# keeps them in the mail log; a server sends nothing and says so in /api/v1/config/.
SITE_URL = env('SITE_URL', 'http://localhost:3000').rstrip('/')         # where links in emails point
EMAIL_HOST = env('EMAIL_HOST', '')
EMAIL_PORT = int(env('EMAIL_PORT', '587'))
EMAIL_HOST_USER = env('EMAIL_HOST_USER', '')
EMAIL_HOST_PASSWORD = env('EMAIL_HOST_PASSWORD', '')
EMAIL_USE_SSL = flag('EMAIL_USE_SSL', '0')
EMAIL_USE_TLS = flag('EMAIL_USE_TLS', '0' if EMAIL_USE_SSL else '1')
EMAIL_TIMEOUT = 15
DEFAULT_FROM_EMAIL = env('DEFAULT_FROM_EMAIL', 'Fashion Teller <hello@fashionteller.com>')
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend' if EMAIL_HOST else 'django.core.mail.backends.console.EmailBackend' if DEBUG else 'django.core.mail.backends.dummy.EmailBackend'
MAIL_MODE = 'smtp' if EMAIL_HOST else 'console' if DEBUG else 'off'
MAIL_ASYNC = flag('MAIL_ASYNC', '1')               # send after the request has answered, on a background thread
MAIL_DEBUG = DEBUG and flag('MAIL_DEBUG', '1')     # /api/v1/dev/mail/ lists recent emails, links included. Development only: it cannot be switched on with DEBUG off.
PASSWORD_RESET_TIMEOUT = 3600                      # a reset link works for one hour
VERIFY_LINK_DAYS = 3

# ───────── payouts ─────────
# What Fashion Teller keeps when a payment is released to a tailor or designer.
PLATFORM_FEE_PERCENT = max(0.0, min(50.0, float(env('PLATFORM_FEE_PERCENT', '10'))))
# paystack: sent automatically with Paystack Transfers.  manual: you pay from your bank and mark each one as sent.
# test: nothing moves; payouts complete by themselves (only where the test checkout is allowed).
PAYOUTS = 'paystack' if PAYSTACK_SECRET_KEY and flag('PAYSTACK_TRANSFERS', '1') else 'test' if ALLOW_TEST_PAYMENTS else 'manual'
TEST_PAYOUT_SECONDS = float(env('TEST_PAYOUT_SECONDS', '6'))

# ───────── photoreal try-on (optional) ─────────
# An AI service that redraws a customer's photo with the garment on. Off until a key is set. Each picture costs money,
# so there is a daily limit per account.
FASHN_API_KEY = env('FASHN_API_KEY', '')
FASHN_API_URL = env('FASHN_API_URL', 'https://api.fashn.ai/v1').rstrip('/')        # the browser tests point this at a stand-in
AI_TRYON_PROVIDER = env('AI_TRYON_PROVIDER', 'fashn' if FASHN_API_KEY else '')
AI_TRYON_MODEL = env('AI_TRYON_MODEL', 'tryon-v1.6')
AI_TRYON_DAILY_LIMIT = int(env('AI_TRYON_DAILY_LIMIT', '10'))

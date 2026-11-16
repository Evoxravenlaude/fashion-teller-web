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

DATABASES = {'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': env('SQLITE_PATH') or BASE_DIR / 'db.sqlite3', 'OPTIONS': {'timeout': 20}}}
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
DATA_UPLOAD_MAX_MEMORY_SIZE = 2 * 1024 * 1024      # a design with a full sketch and three progress photos fits well inside

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

"""
Django settings for core project.

Generated by 'django-admin startproject' using Django 5.2.
Adjusted for best practices and production considerations.

For more information on this file, see
https://docs.djangoproject.com/en/5.2/topics/settings/

For the full list of settings and their values, see
https://docs.djangoproject.com/en/5.2/ref/settings/
"""

import os
from pathlib import Path
from datetime import timedelta # For JWT token lifetimes
from dotenv import load_dotenv

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# Load environment variables from .env file
load_dotenv(os.path.join(BASE_DIR, '.env'))

# Quick-start development settings - unsuitable for production
# See https://docs.djangoproject.com/en/5.2/howto/deployment/checklist/

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = os.getenv('DJANGO_SECRET_KEY', 'django-insecure-dev-key-change-in-production')

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = os.getenv('DJANGO_DEBUG', 'True').lower() == 'true'

# Configure allowed hosts. Be specific in production.
# Example: ALLOWED_HOSTS = ['www.meudominio.com', 'api.meudominio.com']
ALLOWED_HOSTS = os.environ.get('DJANGO_ALLOWED_HOSTS', 'localhost,127.0.0.1,testserver').split(',')
if DEBUG:
    ALLOWED_HOSTS.extend(['.localhost', '127.0.0.1', '[::1]']) # For Docker and local dev

# Application definition

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles', # For serving static files by Django (dev)
    # 'whitenoise.runserver_nostatic', # If using WhiteNoise for static files in prod
    
    # Third-party apps
    'rest_framework',
    'rest_framework.authtoken', # If using TokenAuthentication alongside JWT (optional)
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist', # For token blacklisting on logout (optional)
    'drf_yasg',
    'django.contrib.humanize', # For template tags like `intcomma`

    # Local apps
    'transport',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    # 'whitenoise.middleware.WhiteNoiseMiddleware', # If using WhiteNoise
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'transport.middleware.APIAuthenticationMiddleware',  # Custom API auth middleware
    'transport.middleware.SessionSecurityMiddleware',    # Custom session security
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'core.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'], # Project-level templates directory
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.template.context_processors.csrf',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'core.wsgi.application'


# Database
# https://docs.djangoproject.com/en/5.2/ref/settings/#databases

# Database configuration
if os.getenv('DATABASE_HOST'):
    # PostgreSQL configuration
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': os.getenv('DATABASE_NAME', 'cte_mdfe_db'),
            'USER': os.getenv('DATABASE_USER', 'cte_mdfe_user'),
            'PASSWORD': os.getenv('DATABASE_PASSWORD', ''),
            'HOST': os.getenv('DATABASE_HOST', 'localhost'),
            'PORT': os.getenv('DATABASE_PORT', '5432'),
            'OPTIONS': {
                'connect_timeout': 60,
            },
            'CONN_MAX_AGE': 600,
        }
    }
else:
    # SQLite for local development
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }


# Password validation
# https://docs.djangoproject.com/en/5.2/ref/settings/#auth-password-validators

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
        'OPTIONS': {'min_length': 8} # Consider increasing for better security
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]


# Internationalization
# https://docs.djangoproject.com/en/5.2/topics/i18n/

LANGUAGE_CODE = 'pt-br' # Adjusted to Brazilian Portuguese

TIME_ZONE = 'America/Sao_Paulo' # Adjusted to a common Brazilian timezone

USE_I18N = True

USE_L10N = True # Recommended for formatting dates, numbers, etc.

USE_TZ = True


# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/5.2/howto/static-files/

STATIC_URL = '/static/'

# Static and media files configuration
if os.getenv('STATIC_ROOT'):
    STATIC_ROOT = os.getenv('STATIC_ROOT')
    MEDIA_ROOT = os.getenv('MEDIA_ROOT', BASE_DIR / 'media')
else:
    # Local development
    STATIC_ROOT = BASE_DIR / 'staticfiles_collected'
    MEDIA_ROOT = BASE_DIR / 'mediafiles'

# Directories where Django will look for static files in addition to app's 'static' directories.
STATICFILES_DIRS = [
    BASE_DIR / 'transport/static', # Your app's static files
    # BASE_DIR / 'static', # Project-level static files (if any)
]

# Media files (User-uploaded content)
# https://docs.djangoproject.com/en/5.2/topics/files/
MEDIA_URL = '/media/'

# Cache Configuration
if os.getenv('REDIS_HOST'):
    CACHES = {
        'default': {
            'BACKEND': 'django_redis.cache.RedisCache',
            'LOCATION': f"redis://{os.getenv('REDIS_HOST', 'localhost')}:{os.getenv('REDIS_PORT', '6379')}/0",
            'OPTIONS': {
                'CLIENT_CLASS': 'django_redis.client.DefaultClient',
            },
            'KEY_PREFIX': 'cte_mdfe',
            'TIMEOUT': 300,
        }
    }
    
    # Session storage em Redis
    SESSION_ENGINE = 'django.contrib.sessions.backends.cache'
    SESSION_CACHE_ALIAS = 'default'
else:
    # Local development - sem cache
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.dummy.DummyCache',
        }
    }

# Celery Configuration (para tarefas assíncronas)
if os.getenv('CELERY_BROKER_URL') or os.getenv('REDIS_HOST'):
    CELERY_BROKER_URL = os.getenv('CELERY_BROKER_URL', f"redis://{os.getenv('REDIS_HOST', 'localhost')}:6379/0")
    CELERY_RESULT_BACKEND = os.getenv('CELERY_RESULT_BACKEND', f"redis://{os.getenv('REDIS_HOST', 'localhost')}:6379/0")
    CELERY_ACCEPT_CONTENT = ['json']
    CELERY_TASK_SERIALIZER = 'json'
    CELERY_RESULT_SERIALIZER = 'json'
    CELERY_TIMEZONE = TIME_ZONE

# Default primary key field type
# https://docs.djangoproject.com/en/5.2/ref/settings/#default-auto-field

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Login/Logout URLs
LOGIN_URL = '/login/'
LOGIN_REDIRECT_URL = '/app/'
LOGOUT_REDIRECT_URL = '/'

# Session Security Settings
SESSION_COOKIE_AGE = 3600 * 8  # 8 hours
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SECURE = not DEBUG  # True in production
SESSION_SAVE_EVERY_REQUEST = True
SESSION_EXPIRE_AT_BROWSER_CLOSE = True

# CSRF Security Settings
CSRF_COOKIE_HTTPONLY = True
CSRF_COOKIE_SECURE = not DEBUG  # True in production
CSRF_COOKIE_SAMESITE = 'Lax'

# Django REST Framework Settings
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        'rest_framework.authentication.SessionAuthentication',
        'rest_framework.authentication.BasicAuthentication',
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        'rest_framework.permissions.IsAuthenticated',
    ),
    # Ensure CSRF protection for API calls from web interface
    'DEFAULT_METADATA_CLASS': 'rest_framework.metadata.SimpleMetadata',
    "DEFAULT_RENDERER_CLASSES": (
        "rest_framework.renderers.JSONRenderer",
        "rest_framework.renderers.BrowsableAPIRenderer", # Useful for development
    ),
    "DEFAULT_PARSER_CLASSES": (
        "rest_framework.parsers.JSONParser",
        "rest_framework.parsers.FormParser", # For HTML form data
        "rest_framework.parsers.MultiPartParser", # For file uploads
    ),
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 5,


    # (Optional) Throttling for API rate limiting
    # 'DEFAULT_THROTTLE_CLASSES': [
    #     'rest_framework.throttling.AnonRateThrottle',
    #     'rest_framework.throttling.UserRateThrottle'
    # ],
    # 'DEFAULT_THROTTLE_RATES': {
    #     'anon': '100/day',  # For anonymous users
    #     'user': '1000/day' # For authenticated users
    # }
}

# Simple JWT Settings
# https://django-rest-framework-simplejwt.readthedocs.io/en/latest/settings.html
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=60), # Adjust as needed
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),    # Adjust as needed
    "ROTATE_REFRESH_TOKENS": True, # Issues a new refresh token when a refresh token is used
    "BLACKLIST_AFTER_ROTATION": True, # Blacklists the old refresh token
    "UPDATE_LAST_LOGIN": True, # Updates user's last_login field on token refresh

    "ALGORITHM": "HS256",
    "SIGNING_KEY": SECRET_KEY, # Uses the Django SECRET_KEY by default
    "VERIFYING_KEY": None,
    "AUDIENCE": None,
    "ISSUER": None,
    "JWK_URL": None,
    "LEEWAY": 0,

    "AUTH_HEADER_TYPES": ("Bearer",), # Standard "Bearer <token>"
    "AUTH_HEADER_NAME": "HTTP_AUTHORIZATION",
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
    "USER_AUTHENTICATION_RULE": "rest_framework_simplejwt.authentication.default_user_authentication_rule",

    "AUTH_TOKEN_CLASSES": ("rest_framework_simplejwt.tokens.AccessToken",),
    "TOKEN_TYPE_CLAIM": "token_type",
    "TOKEN_USER_CLASS": "rest_framework_simplejwt.models.TokenUser",

    "JTI_CLAIM": "jti",

    # For sliding tokens (optional, refreshes access token on each request)
    # "SLIDING_TOKEN_REFRESH_EXP_CLAIM": "refresh_exp",
    # "SLIDING_TOKEN_LIFETIME": timedelta(minutes=5),
    # "SLIDING_TOKEN_REFRESH_LIFETIME": timedelta(days=1),
}

# These are duplicate settings - removing to avoid conflicts

# DRF-YASG (Swagger) Settings
SWAGGER_SETTINGS = {
    'SECURITY_DEFINITIONS': {
        'Bearer': {
            'type': 'apiKey',
            'name': 'Authorization',
            'in': 'header',
            'description': "Enter 'Bearer <token>'",
        }
    },
    # With JWT-only authentication we disable session auth in Swagger UI
    'USE_SESSION_AUTH': False,
    'LOGIN_URL': LOGIN_URL,
    'LOGOUT_URL': '/admin/logout/', # Using admin logout for Swagger UI
    'VALIDATOR_URL': None, # Set to None to disable schema validation errors in UI
    'OPERATIONS_SORTER': 'alpha',
    'TAGS_SORTER': 'alpha',
    'DOC_EXPANSION': 'list', # 'none', 'list', 'full'
    'DEFAULT_MODEL_RENDERING': 'example',
}
REDOC_SETTINGS = {
    'LAZY_RENDERING': False,
    'PATH_IN_MIDDLE': True,
}

# Logging Configuration (Basic example)
# For production, configure more robust logging (e.g., to files, external services)
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {process:d} {thread:d} {message}',
            'style': '{',
        },
        'simple': {
            'format': '{levelname} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'level': 'INFO', # Adjust level for production (e.g., WARNING or ERROR)
            'class': 'logging.StreamHandler',
            'formatter': 'simple' if DEBUG else 'verbose', # Simpler for dev, verbose for prod
        },
        # Example file handler (uncomment and configure for production)
        # 'file': {
        #     'level': 'WARNING',
        #     'class': 'logging.FileHandler',
        #     'filename': BASE_DIR / 'logs/django.log',
        #     'formatter': 'verbose',
        # },
    },
    'root': {
        'handlers': ['console'], # Add 'file' handler for production
        'level': 'INFO', # Root logger level
    },
    'loggers': {
        'django': {
            'handlers': ['console'], # Add 'file'
            'level': os.getenv('DJANGO_LOG_LEVEL', 'INFO'),
            'propagate': False,
        },
        'transport': { # Your app's logger
            'handlers': ['console'], # Add 'file'
            'level': 'DEBUG' if DEBUG else 'INFO',
            'propagate': False,
        },
        'transport.views': {
            'handlers': ['console'],
            'level': 'DEBUG' if DEBUG else 'INFO',
            'propagate': False,
        },
    }
}

# Email Configuration (Example for console backend during development)
# For production, configure SMTP settings using environment variables.
if DEBUG:
    EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'
else:
    EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
    EMAIL_HOST = os.environ.get('DJANGO_EMAIL_HOST')
    EMAIL_PORT = int(os.environ.get('DJANGO_EMAIL_PORT', 587))
    EMAIL_USE_TLS = os.environ.get('DJANGO_EMAIL_USE_TLS', 'True') == 'True'
    EMAIL_USE_SSL = os.environ.get('DJANGO_EMAIL_USE_SSL', 'False') == 'True'
    EMAIL_HOST_USER = os.environ.get('DJANGO_EMAIL_HOST_USER')
    EMAIL_HOST_PASSWORD = os.environ.get('DJANGO_EMAIL_HOST_PASSWORD')
    DEFAULT_FROM_EMAIL = os.environ.get('DJANGO_DEFAULT_FROM_EMAIL', 'webmaster@localhost')
    SERVER_EMAIL = os.environ.get('DJANGO_SERVER_EMAIL', DEFAULT_FROM_EMAIL) # For error reports

# Configurações de Upload (Django as usa para MultiPartParser)
FILE_UPLOAD_MAX_MEMORY_SIZE = 2621440  # 2.5MB - padrão do Django
DATA_UPLOAD_MAX_MEMORY_SIZE = 2621440  # 2.5MB - padrão
DATA_UPLOAD_MAX_NUMBER_FIELDS = 10000   # padrão

# NOVO/AJUSTADO: Limite para número de arquivos em um upload multipart
DATA_UPLOAD_MAX_NUMBER_FILES = 9000 # Aumentar conforme necessidade


# --- Security Settings for Production (Uncomment and configure as needed) ---
# if not DEBUG:
#     SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
#     SECURE_SSL_REDIRECT = True
#     SESSION_COOKIE_SECURE = True
#     CSRF_COOKIE_SECURE = True
#     SECURE_BROWSER_XSS_FILTER = True
#     SECURE_CONTENT_TYPE_NOSNIFF = True
#     # HSTS Settings (use with caution, understand implications)
#     # SECURE_HSTS_SECONDS = 31536000  # 1 year
#     # SECURE_HSTS_INCLUDE_SUBDOMAINS = True
#     # SECURE_HSTS_PRELOAD = True

# (Optional) WhiteNoise for serving static files in production if not using Nginx/Apache for it
# STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'

# =============================================================================
# CONFIGURAÇÕES PARA RESOLVER PROBLEMAS DE CACHE
# =============================================================================

# Configurações de Sessão para evitar problemas de cache
SESSION_COOKIE_AGE = 3600  # 1 hora (em segundos)
SESSION_EXPIRE_AT_BROWSER_CLOSE = True  # Sessão expira ao fechar navegador
SESSION_SAVE_EVERY_REQUEST = True  # Salva sessão a cada request (renova tempo)
SESSION_COOKIE_NAME = 'cte_mdfe_sessionid'  # Nome único para o cookie de sessão
SESSION_COOKIE_HTTPONLY = True  # Previne acesso via JavaScript
SESSION_COOKIE_SAMESITE = 'Lax'  # Proteção CSRF

# Configurações CSRF para evitar problemas de cache
CSRF_COOKIE_AGE = 3600  # 1 hora (em segundos)
CSRF_COOKIE_NAME = 'cte_mdfe_csrftoken'  # Nome único para o cookie CSRF
CSRF_COOKIE_HTTPONLY = False  # JavaScript precisa acessar para enviar token
CSRF_COOKIE_SAMESITE = 'Lax'  # Proteção CSRF
CSRF_USE_SESSIONS = False  # Usar cookie ao invés de sessão para CSRF
CSRF_FAILURE_VIEW = 'django.views.csrf.csrf_failure'  # View padrão para falha CSRF

# Em produção (quando não for DEBUG), usar cookies seguros
if not DEBUG:
    SESSION_COOKIE_SECURE = True  # Apenas HTTPS
    CSRF_COOKIE_SECURE = True     # Apenas HTTPS
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
    SECURE_SSL_REDIRECT = True
    SECURE_BROWSER_XSS_FILTER = True
    SECURE_CONTENT_TYPE_NOSNIFF = True

# Headers de cache específicos para Django (complementam o Nginx)
CACHE_MIDDLEWARE_SECONDS = 0  # Desabilita cache middleware
CACHE_MIDDLEWARE_KEY_PREFIX = 'cte_mdfe'
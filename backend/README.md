# Fashion Teller API

Django 5.2 + Django REST Framework. Setup, environment variables, routes and what is not built yet are in the
project's main `README.md`; this is the short version.

    pip install -r requirements.txt
    python manage.py migrate
    python manage.py seed            # demo data and demo accounts (development)
    python manage.py runserver 127.0.0.1:8000
    python manage.py test            # 12 tests

| | |
|---|---|
| `config/settings.py` | Everything that differs between machines comes from the environment (`.env.example`) |
| `core/models.py` | Accounts, designers, tailors, designs and versions, commissions, orders, payments, messages, notifications, reviews, reports |
| `core/views.py`, `core/urls.py` | The endpoints, one function each |
| `core/api.py` | Shared logic: the `@route` decorator, response shapes, payments, notifications, the game, sample tailors and designers |
| `core/rules.py` | The design rules (clean a spec, price, title, change list, challenges), ported from the site's engine |
| `core/data/` | Catalogue, test vectors and demo data, exported from the site with `node tools/export_catalog.js` |
| `Dockerfile`, `Procfile` | Two ways to run it on a host |

On a machine with no `DJANGO_SECRET_KEY`, `manage.py` assumes development: debug on, SQLite, test checkout, sample
tailors and designers. On a server (secret key set, or anything started through `config/wsgi.py`) all of that is off
unless you turn it on by name.

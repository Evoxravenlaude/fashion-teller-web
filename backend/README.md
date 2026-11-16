# Fashion Teller API

Django 5.2 + Django REST Framework. Setup, environment variables, routes and what is not built yet are in the
project's main `README.md`; this is the short version.

    pip install -r requirements.txt
    python manage.py migrate
    python manage.py seed            # demo data and demo accounts (development)
    python manage.py runserver 127.0.0.1:8000
    python manage.py test            # 18 tests

| | |
|---|---|
| `config/settings.py` | Everything that differs between machines comes from the environment (`.env.example`) |
| `core/models.py` | Accounts, designers, tailors, designs and versions, commissions, orders, payments, payouts and bank accounts, messages, notifications, the email log, reviews, reports |
| `core/views.py`, `core/urls.py` | The endpoints, one function each |
| `core/extras.py`, `core/views_extra.py` | Email (confirm address, reset password, notifications), payouts (fee, bank accounts, Paystack Transfers and its webhook) and Photoreal try-on |
| `core/api.py` | Shared logic: the `@route` decorator, response shapes, payments, notifications, the game, sample tailors and designers |
| `core/rules.py` | The design rules (clean a spec, price, title, change list, challenges), ported from the site's engine |
| `core/data/` | Catalogue, test vectors and demo data, exported from the site with `node tools/export_catalog.js` |
| `Dockerfile`, `Procfile` | Two ways to run it on a host |

On a machine with no `DJANGO_SECRET_KEY`, `manage.py` assumes development: debug on, SQLite, test checkout, sample
tailors and designers. On a server (secret key set, or anything started through `config/wsgi.py`) all of that is off
unless you turn it on by name.

Three things reach outside services, and each stays off until its setting is there: email (`EMAIL_HOST…`), automatic
payouts and live payments (`PAYSTACK_SECRET_KEY`), Photoreal try-on (`FASHN_API_KEY`). The main README has the setup
for each. In development, emails are printed to the console and listed at `/api/v1/dev/mail/`, and payouts are
marked paid after a few seconds without moving money.

Emails and Paystack transfers are sent on a background thread after the request that caused them has been saved, so
a slow provider never holds a page up. If the process stops in that moment (a deploy, a crash), an email is left as
`queued` and is not retried, and a payout is left "on its way". After ten minutes Admin → Payouts offers "Check with
Paystack" on such a payout: it asks Paystack what became of it, and sends it only if Paystack never received it. It is
sent under the same reference, which Paystack accepts once, so a payout cannot go out twice this way.

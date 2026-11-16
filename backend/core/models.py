"""Fashion Teller data model. One table per thing the product talks about; JSON only where the shape is the client's (a design spec)."""
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager
from django.db import models
from django.utils import timezone

now = timezone.now
FK = lambda to, **kw: models.ForeignKey(to, on_delete=kw.pop('on_delete', models.CASCADE), **kw)
NFK = lambda to, **kw: models.ForeignKey(to, on_delete=models.SET_NULL, null=True, blank=True, **kw)


class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra):
        user = self.model(email=self.normalize_email(email).lower(), **extra)
        user.set_password(password) if password else user.set_unusable_password()
        user.save()
        return user


class User(AbstractBaseUser):
    email = models.EmailField(unique=True)
    name = models.CharField(max_length=80)
    role = models.CharField(max_length=10, default='customer', choices=[(r, r) for r in ('customer', 'tailor', 'admin')])
    phone = models.CharField(max_length=30, blank=True)
    city = models.CharField(max_length=60, blank=True)
    country = models.CharField(max_length=60, blank=True)
    status = models.CharField(max_length=10, default='active')       # active | suspended
    sample = models.BooleanField(default=False)                         # a built-in tailor or designer that acts on its own (SAMPLE_MODE)
    demo = models.BooleanField(default=False)
    email_verified = models.BooleanField(default=False)
    email_prefs = models.JSONField(default=dict, blank=True)             # {orders: bool, messages: bool}; missing means yes
    created_at = models.DateTimeField(default=now)
    objects = UserManager()
    USERNAME_FIELD = 'email'

    @property
    def is_active(self):
        return self.status == 'active'

    @property
    def is_authenticated(self):
        return True


class Designer(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='designer')
    handle = models.CharField(max_length=24, unique=True)
    bio = models.CharField(max_length=400)
    specialties = models.JSONField(default=list)
    open = models.BooleanField(default=True)
    fee_from = models.PositiveIntegerField(default=0)
    turnaround_days = models.PositiveSmallIntegerField(default=3)
    rating = models.FloatField(default=0)
    reviews = models.PositiveIntegerField(default=0)
    completed = models.PositiveIntegerField(default=0)
    featured = models.BooleanField(default=False)
    followers_base = models.PositiveIntegerField(default=0)
    sample = models.BooleanField(default=False)
    created_at = models.DateTimeField(default=now)


class Vendor(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='vendor')
    name = models.CharField(max_length=80)
    city = models.CharField(max_length=60, blank=True)
    country = models.CharField(max_length=60, blank=True)
    specialties = models.JSONField(default=list)
    bio = models.CharField(max_length=500, blank=True)
    rating = models.FloatField(default=0)
    reviews = models.PositiveIntegerField(default=0)
    orders_done = models.PositiveIntegerField(default=0)
    price_factor = models.FloatField(default=1)
    speed_factor = models.FloatField(default=1)
    lead_min = models.PositiveSmallIntegerField(default=7)
    since = models.PositiveSmallIntegerField(default=2024)
    status = models.CharField(max_length=10, default='pending', db_index=True)   # pending | verified | rejected | suspended
    verified_at = models.DateTimeField(null=True, blank=True)
    sample = models.BooleanField(default=False)
    hue = models.PositiveSmallIntegerField(default=40)
    created_at = models.DateTimeField(default=now)


class Application(models.Model):
    user = FK(User)
    vendor = FK(Vendor)
    workshop = models.CharField(max_length=80)
    name = models.CharField(max_length=80)
    email = models.CharField(max_length=120)
    phone = models.CharField(max_length=30, blank=True)
    city = models.CharField(max_length=60, blank=True)
    country = models.CharField(max_length=60, blank=True)
    specialties = models.JSONField(default=list)
    about = models.CharField(max_length=500, blank=True)
    status = models.CharField(max_length=10, default='pending')
    created_at = models.DateTimeField(default=now)


class Design(models.Model):
    user = FK(User, related_name='designs')
    title = models.CharField(max_length=90)
    renamed = models.BooleanField(default=False)
    prompt = models.CharField(max_length=600, blank=True)
    source = models.CharField(max_length=10, default='builder')
    status = models.CharField(max_length=10, default='draft')         # draft | requested | ordered
    current = models.PositiveIntegerField(default=1)
    published = models.BooleanField(default=False, db_index=True)
    published_at = models.DateTimeField(null=True, blank=True)
    caption = models.CharField(max_length=240, blank=True)
    tags = models.JSONField(default=list)
    allow_remix = models.BooleanField(default=True)
    remix_of = NFK('self', related_name='remixes')
    remix_info = models.JSONField(null=True, blank=True)               # {design_id, title, by, by_id}: kept even if the original goes
    credit = models.JSONField(null=True, blank=True)                   # {id, name, handle}: who designed it, when it was not the owner
    commission_of = models.CharField(max_length=20, blank=True)
    like_base = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(default=now)
    updated_at = models.DateTimeField(default=now)


class Version(models.Model):
    design = FK(Design, related_name='versions')
    n = models.PositiveIntegerField()
    instruction = models.CharField(max_length=120, blank=True)
    spec = models.JSONField()
    changes = models.JSONField(default=list)
    from_n = models.PositiveIntegerField(null=True, blank=True)
    restored = models.PositiveIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(default=now)

    class Meta:
        unique_together = [('design', 'n')]
        ordering = ['n']


class Like(models.Model):
    user = FK(User)
    design = FK(Design, related_name='likes')
    at = models.DateTimeField(default=now)

    class Meta:
        unique_together = [('user', 'design')]


class Saved(models.Model):
    user = FK(User)
    design = FK(Design, related_name='saves')
    at = models.DateTimeField(default=now)

    class Meta:
        unique_together = [('user', 'design')]


class Follow(models.Model):
    user = FK(User, related_name='following')
    target = FK(User, related_name='followers')
    at = models.DateTimeField(default=now)

    class Meta:
        unique_together = [('user', 'target')]


class Measurement(models.Model):
    user = FK(User, related_name='measurements')
    label = models.CharField(max_length=40, default='Me')
    unit = models.CharField(max_length=2, default='cm')
    values = models.JSONField(default=dict)
    fit = models.CharField(max_length=10, default='regular')
    notes = models.CharField(max_length=400, blank=True)
    created_at = models.DateTimeField(default=now)
    updated_at = models.DateTimeField(default=now)


class QuoteRequest(models.Model):
    design = FK(Design, related_name='requests')
    version_n = models.PositiveIntegerField()
    user = FK(User)
    measurement = NFK(Measurement)
    notes = models.CharField(max_length=600, blank=True)
    deadline = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=10, default='open', db_index=True)    # open | closed | ordered
    created_at = models.DateTimeField(default=now)


class Quote(models.Model):
    request = FK(QuoteRequest, related_name='quotes')
    design = FK(Design)
    vendor = FK(Vendor)
    price = models.PositiveIntegerField()
    delivery_days = models.PositiveSmallIntegerField()
    note = models.CharField(max_length=400, blank=True)
    includes_fabric = models.BooleanField(default=True)
    status = models.CharField(max_length=10, default='offered')       # offered | accepted | declined | withdrawn
    valid_until = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=now)
    updated_at = models.DateTimeField(default=now)

    class Meta:
        unique_together = [('request', 'vendor')]


class Order(models.Model):
    number = models.CharField(max_length=12, unique=True)             # FT-123456, what people see and quote
    user = FK(User, related_name='orders')
    vendor = FK(Vendor, related_name='orders')
    design = NFK(Design)
    version_n = models.PositiveIntegerField(default=1)
    quote = NFK(Quote)
    request = NFK(QuoteRequest)
    measurement = NFK(Measurement)
    total = models.PositiveIntegerField()
    paid = models.PositiveIntegerField(default=0)
    plan = models.CharField(max_length=8, default='full')
    phase = models.CharField(max_length=20, default='concept_generated')
    status = models.CharField(max_length=20, default='awaiting_payment', db_index=True)   # awaiting_payment | active | balance_due | delivered | completed | cancelled
    delivery_days = models.PositiveSmallIntegerField(default=7)
    paid_at = models.DateTimeField(null=True, blank=True)
    eta = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    received_at = models.DateTimeField(null=True, blank=True)
    issue = models.JSONField(null=True, blank=True)
    events = models.JSONField(default=list)
    created_at = models.DateTimeField(default=now)


class Commission(models.Model):
    client = FK(User, related_name='commissions')
    designer = FK(User, related_name='client_commissions')
    title = models.CharField(max_length=90)
    brief = models.CharField(max_length=2000)
    garment = models.CharField(max_length=10, blank=True)
    occasion = models.CharField(max_length=60, blank=True)
    budget = models.PositiveIntegerField(default=0)
    deadline = models.DateField(null=True, blank=True)
    ref_design = NFK(Design, related_name='+')
    status = models.CharField(max_length=10, default='requested', db_index=True)   # requested | offered | active | delivered | changes | approved | declined | cancelled
    offer = models.JSONField(null=True, blank=True)
    paid = models.PositiveIntegerField(default=0)
    paid_at = models.DateTimeField(null=True, blank=True)
    revisions = models.PositiveSmallIntegerField(default=0)
    max_revisions = models.PositiveSmallIntegerField(default=2)
    deliveries = models.JSONField(default=list)
    result_design = NFK(Design, related_name='+')
    change_note = models.CharField(max_length=600, blank=True)
    thread = NFK('Thread', related_name='+')
    created_at = models.DateTimeField(default=now)
    updated_at = models.DateTimeField(default=now)


class Payment(models.Model):
    order = NFK(Order, related_name='payments')
    commission = NFK(Commission, related_name='payments')
    user = FK(User)
    amount = models.PositiveIntegerField()
    kind = models.CharField(max_length=10)                              # full | deposit | balance | commission
    method = models.CharField(max_length=10)
    reference = models.CharField(max_length=60, unique=True)
    status = models.CharField(max_length=10, default='paid')           # pending | paid (held) | released | refunded
    last4 = models.CharField(max_length=4, blank=True)
    created_at = models.DateTimeField(default=now)


class Review(models.Model):
    kind = models.CharField(max_length=10)                              # order | commission
    order = models.OneToOneField(Order, on_delete=models.SET_NULL, null=True, blank=True, related_name='review')
    commission = models.OneToOneField(Commission, on_delete=models.SET_NULL, null=True, blank=True, related_name='review')
    by = FK(User)
    vendor = NFK(Vendor, related_name='review_list')
    designer = NFK(User, related_name='designer_reviews')
    rating = models.PositiveSmallIntegerField()
    text = models.CharField(max_length=600, blank=True)
    created_at = models.DateTimeField(default=now)


class Thread(models.Model):
    kind = models.CharField(max_length=10)                              # direct | order | commission
    ref_id = models.CharField(max_length=20, blank=True, db_index=True)
    title = models.CharField(max_length=120, blank=True)
    created_at = models.DateTimeField(default=now)
    updated_at = models.DateTimeField(default=now)


class Member(models.Model):
    thread = FK(Thread, related_name='members')
    user = FK(User, related_name='memberships')
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = [('thread', 'user')]


class Message(models.Model):
    thread = FK(Thread, related_name='messages')
    by = NFK(User)                                                      # empty = a system line
    text = models.CharField(max_length=2000)
    design = NFK(Design, related_name='+')
    at = models.DateTimeField(default=now, db_index=True)

    class Meta:
        ordering = ['at', 'id']


class Outbox(models.Model):
    """A reply a sample tailor or designer will send (SAMPLE_MODE)."""
    thread = FK(Thread)
    by = FK(User)
    text = models.CharField(max_length=400)
    due_at = models.DateTimeField()


class Notification(models.Model):
    user = FK(User, related_name='notifications')
    kind = models.CharField(max_length=12)
    title = models.CharField(max_length=120)
    body = models.CharField(max_length=200, blank=True)
    href = models.CharField(max_length=200, blank=True)
    key = models.CharField(max_length=40, blank=True)
    read = models.BooleanField(default=False)
    at = models.DateTimeField(default=now)

    class Meta:
        ordering = ['-at', '-id']
        indexes = [models.Index(fields=['user', 'read'])]


class Report(models.Model):
    kind = models.CharField(max_length=10)                              # design | user | message | order
    ref_id = models.CharField(max_length=20)
    reason = models.CharField(max_length=60)
    note = models.CharField(max_length=1000, blank=True)
    by = FK(User)
    status = models.CharField(max_length=10, default='open')
    resolution = models.CharField(max_length=10, blank=True)
    created_at = models.DateTimeField(default=now)
    resolved_at = models.DateTimeField(null=True, blank=True)


class ContactMessage(models.Model):
    name = models.CharField(max_length=80, blank=True)
    email = models.CharField(max_length=120)
    topic = models.CharField(max_length=60, blank=True)
    message = models.CharField(max_length=4000)
    status = models.CharField(max_length=10, default='new')
    created_at = models.DateTimeField(default=now)


class Audit(models.Model):
    by = models.CharField(max_length=80)
    action = models.CharField(max_length=40)
    target = models.CharField(max_length=120)
    at = models.DateTimeField(default=now)

    class Meta:
        ordering = ['-at', '-id']


class Game(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='game')
    data = models.JSONField(default=dict)


class Mail(models.Model):
    """Every email the site sends, and whether it went. Also what the development mailbox shows."""
    user = NFK(User, related_name='mails')
    to = models.EmailField()
    kind = models.CharField(max_length=20)                              # verify | reset | order | quote | commission | payout | message
    subject = models.CharField(max_length=160)
    text = models.TextField()
    link = models.CharField(max_length=400, blank=True)                 # a path on the site
    status = models.CharField(max_length=10, default='queued')         # queued | sent | failed
    error = models.CharField(max_length=300, blank=True)
    tries = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(default=now)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-id']


class PayoutAccount(models.Model):
    """Where a tailor or designer is paid. With Paystack transfers on, only the recipient code and last four digits are kept."""
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='payout_account')
    bank_code = models.CharField(max_length=12)
    bank_name = models.CharField(max_length=80)
    account_name = models.CharField(max_length=120)
    last4 = models.CharField(max_length=4)
    number = models.CharField(max_length=10, blank=True)                # kept only when payouts are made by hand
    recipient_code = models.CharField(max_length=40, blank=True)        # Paystack transfer recipient
    created_at = models.DateTimeField(default=now)


class Payout(models.Model):
    """Money owed to a tailor or designer once a payment is released: the amount paid, less the platform fee."""
    user = FK(User, related_name='payouts')
    kind = models.CharField(max_length=12)                              # order | commission
    order = NFK(Order, related_name='payouts')
    commission = NFK(Commission, related_name='payouts')
    title = models.CharField(max_length=120)
    gross = models.PositiveIntegerField()
    fee = models.PositiveIntegerField()
    net = models.PositiveIntegerField()
    status = models.CharField(max_length=12, default='pending', db_index=True)   # pending | processing | paid | failed | reversed
    reference = models.CharField(max_length=40, unique=True)
    transfer_code = models.CharField(max_length=40, blank=True)
    note = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(default=now)
    sent_at = models.DateTimeField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-id']


class TryOnJob(models.Model):
    """One photoreal try-on picture asked of the AI service."""
    user = FK(User, related_name='tryons')
    design = NFK(Design)
    provider = models.CharField(max_length=20)
    provider_id = models.CharField(max_length=80, blank=True)
    status = models.CharField(max_length=10, default='running')        # running | done | failed
    error = models.CharField(max_length=200, blank=True)
    image = models.TextField(blank=True)                                # the finished picture, as a data URL or an https URL
    created_at = models.DateTimeField(default=now)

"""The API map. Everything is under /api/v1/. The client that calls these lives in assets/js/api.js."""
from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from . import views as v

urlpatterns = [
    # accounts
    path('auth/register/', v.register), path('auth/login/', v.login), path('auth/refresh/', TokenRefreshView.as_view()),
    path('me/', v.me), path('me/password/', v.password), path('me/game/', v.game), path('me/unread/', v.unread),
    path('me/notifications/', v.notifications), path('me/notifications/read/', v.notifications_read),
    path('me/measurements/', v.measurements), path('me/measurements/<str:pk>/', v.measurement), path('me/designer/', v.my_designer),
    # designs
    path('designs/', v.designs), path('designs/<str:pk>/', v.design), path('designs/<str:pk>/versions/', v.design_versions), path('designs/<str:pk>/restore/', v.design_restore),
    path('designs/<str:pk>/duplicate/', v.design_duplicate), path('designs/<str:pk>/try-on/', v.design_try_on), path('designs/<str:pk>/publish/', v.design_publish), path('designs/<str:pk>/unpublish/', v.design_unpublish),
    path('designs/<str:pk>/like/', v.design_like), path('designs/<str:pk>/save/', v.design_save), path('designs/<str:pk>/remix/', v.design_remix),
    path('designs/<str:pk>/requests/', v.design_requests), path('designs/<str:pk>/requests/latest/', v.design_request_latest), path('designs/<str:pk>/quotes/', v.design_quotes),
    path('discover/', v.discover), path('reports/', v.reports),
    # designers + commissions
    path('designers/', v.designers), path('designers/<str:key>/', v.designer), path('designers/<str:pk>/follow/', v.follow),
    path('commissions/', v.commissions), path('commissions/<str:pk>/', v.commission), path('commissions/<str:pk>/offer/', v.commission_offer), path('commissions/<str:pk>/decline/', v.commission_decline),
    path('commissions/<str:pk>/pay/', v.commission_pay), path('commissions/<str:pk>/pay/init/', v.commission_pay_init), path('commissions/<str:pk>/deliver/', v.commission_deliver),
    path('commissions/<str:pk>/changes/', v.commission_changes), path('commissions/<str:pk>/approve/', v.commission_approve), path('commissions/<str:pk>/cancel/', v.commission_cancel),
    path('reviews/', v.reviews),
    # messages
    path('threads/', v.threads), path('threads/<str:pk>/', v.thread), path('threads/<str:pk>/messages/', v.thread_messages),
    # tailors
    path('vendors/', v.vendors), path('vendors/me/', v.my_vendor), path('vendors/apply/', v.vendor_apply), path('vendors/requests/', v.vendor_requests), path('vendors/requests/<str:pk>/quote/', v.vendor_quote),
    path('vendors/quotes/', v.vendor_quotes), path('vendors/orders/', v.vendor_orders), path('vendors/orders/<str:number>/events/', v.vendor_order_events), path('vendors/<str:pk>/', v.vendor),
    # orders
    path('orders/', v.orders), path('orders/<str:number>/', v.order), path('orders/<str:number>/pay/', v.order_pay), path('orders/<str:number>/pay/init/', v.order_pay_init),
    path('orders/<str:number>/cancel/', v.order_cancel), path('orders/<str:number>/confirm/', v.order_confirm), path('orders/<str:number>/problem/', v.order_problem),
    path('contact/', v.contact),
    # admin
    path('admin/stats/', v.admin_stats), path('admin/users/', v.admin_users), path('admin/users/<str:pk>/status/', v.admin_user_status), path('admin/vendors/', v.admin_vendors),
    path('admin/vendors/<str:pk>/status/', v.admin_vendor_status), path('admin/designs/', v.admin_designs), path('admin/orders/', v.admin_orders), path('admin/orders/<str:number>/phase/', v.admin_order_phase),
    path('admin/orders/<str:number>/issue/', v.admin_order_issue), path('admin/payments/', v.admin_payments), path('admin/payments/<str:pk>/refund/', v.admin_refund), path('admin/commissions/', v.admin_commissions),
    path('admin/reports/', v.admin_reports), path('admin/reports/<str:pk>/resolve/', v.admin_report_resolve), path('admin/messages/', v.admin_messages), path('admin/applications/', v.admin_applications), path('admin/audit/', v.admin_audit),
]

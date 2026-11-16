from django.http import JsonResponse
from django.urls import include, path

urlpatterns = [
    path('', lambda r: JsonResponse({'service': 'Fashion Teller API', 'api': '/api/v1/', 'health': '/healthz'})),
    path('healthz', lambda r: JsonResponse({'ok': True})),
    path('api/v1/', include('core.urls')),
]

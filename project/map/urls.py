from django.urls import path
from . import views

urlpatterns = [
    path("", views.index),
    path("Gushan.geojson", views.roads),
    path("Taoyuan.geojson", views.school_roads),
]
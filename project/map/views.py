from django.shortcuts import render

def index(request):
    return render(request, 'index.html')

def roads(request):
    return render(request, 'Gushan.geojson')

def school_roads(request):
    return render(request, 'Taoyuan.geojson')
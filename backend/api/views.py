from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.decorators import action
from .models import Building
from .serializers import BuildingSerializer
import math

# Geodetic constants
LAT_MAX = 19.506085642577684
LAT_MIN = 19.501672871991357
LON_MAX = -99.14538442387669
LON_MIN = -99.14882990272824

DELTA_LAT = LAT_MAX - LAT_MIN
DELTA_LON = LON_MAX - LON_MIN
LAT_0 = (LAT_MAX + LAT_MIN) / 2
LAT_0_RAD = (LAT_0 * math.pi) / 180
W = 1000.0
H = W * (DELTA_LAT / (DELTA_LON * math.cos(LAT_0_RAD)))

def to_lon(x):
    return LON_MIN + (x * DELTA_LON) / W

def to_lat(y):
    return LAT_MAX - (y * DELTA_LAT) / H

INITIAL_BUILDINGS_RAW = [
    {
        "id": "edificio-1",
        "name": "Edificio 1 (Principal)",
        "color": "#5c7cfa",
        "strokeColor": "#364fc7",
        "strokeWidth": 2.0,
        "pointsStr": "387.25,556.19 461.4,396.41 517.64,423.27 503.04,452.85 483.58,444.29 422.04,573.99"
    },
    {
        "id": "edificio-2",
        "name": "Edificio 2 (Biblioteca)",
        "color": "#ff922b",
        "strokeColor": "#d9480f",
        "strokeWidth": 2.0,
        "pointsStr": "464.69,389.27 540.4,230.07 573.48,246.23 505.86,397.52"
    },
    {
        "id": "edificio-3",
        "name": "Edificio 3 (Laboratorios)",
        "color": "#51cf66",
        "strokeColor": "#2b8a3e",
        "strokeWidth": 2.0,
        "pointsStr": "490.26,539.61 562.71,389.7 626.25,420.04 557.0,570.66"
    },
    {
        "id": "puente",
        "name": "Puente Peatonal",
        "color": "#fcc419",
        "strokeColor": "#e67e22",
        "strokeWidth": 1.5,
        "pointsStr": "544.26,427.5 501.45,406.29 505.73,397.72 549.13,418.16"
    }
]

def seed_database_if_empty():
    if Building.objects.count() == 0:
        for item in INITIAL_BUILDINGS_RAW:
            coords = []
            for pair in item["pointsStr"].strip().split():
                x_str, y_str = pair.split(",")
                coords.append([to_lat(float(y_str)), to_lon(float(x_str))])
            
            Building.objects.create(
                id=item["id"],
                name=item["name"],
                color=item["color"],
                strokeColor=item["strokeColor"],
                strokeWidth=item["strokeWidth"],
                rawCoordinates=coords
            )

class BuildingViewSet(viewsets.ModelViewSet):
    queryset = Building.objects.all()
    serializer_class = BuildingSerializer

    def list(self, request, *args, **kwargs):
        seed_database_if_empty()
        return super().list(request, *args, **kwargs)

    @action(detail=False, methods=['post'])
    def reset_defaults(self, request):
        Building.objects.all().delete()
        for item in INITIAL_BUILDINGS_RAW:
            coords = []
            for pair in item["pointsStr"].strip().split():
                x_str, y_str = pair.split(",")
                coords.append([to_lat(float(y_str)), to_lon(float(x_str))])
            
            Building.objects.create(
                id=item["id"],
                name=item["name"],
                color=item["color"],
                strokeColor=item["strokeColor"],
                strokeWidth=item["strokeWidth"],
                rawCoordinates=coords
            )
        queryset = Building.objects.all()
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

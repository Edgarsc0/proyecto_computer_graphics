from django.db import models

class Building(models.Model):
    id = models.CharField(max_length=100, primary_key=True)
    name = models.CharField(max_length=255)
    color = models.CharField(max_length=50)
    strokeColor = models.CharField(max_length=50)
    strokeWidth = models.FloatField(default=2.0)
    rawCoordinates = models.JSONField() # List of [lat, lon] lists

    def __str__(self):
        return self.name

from django.contrib import admin
from .models import (
    Hall,
    Room,
    Student,
    Semester,
    Application,
    Allocation,
    TransferRequest,
    MaintenanceRecord,
)

admin.site.register(Hall)
admin.site.register(Room)
admin.site.register(Student)
admin.site.register(Semester)
admin.site.register(Application)
admin.site.register(Allocation)
admin.site.register(TransferRequest)
admin.site.register(MaintenanceRecord)
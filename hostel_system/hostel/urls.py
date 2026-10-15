from rest_framework.routers import DefaultRouter
from django.urls import path
from .views import (
    AdminLoginView,
    AdminLogoutView,
    StudentLoginView,
    StudentProfileView,
    StudentRegistrationView,
    HallViewSet,
    RoomViewSet,
    StudentViewSet,
    SemesterViewSet,
    ApplicationViewSet,
    AllocationViewSet,
    TransferRequestViewSet,
    MaintenanceRecordViewSet,
)

router = DefaultRouter()

router.register("halls", HallViewSet)
router.register("rooms", RoomViewSet)
router.register("students", StudentViewSet)
router.register("semesters", SemesterViewSet)
router.register("applications", ApplicationViewSet)
router.register("allocations", AllocationViewSet)
router.register("transfers", TransferRequestViewSet)
router.register("maintenance", MaintenanceRecordViewSet)

urlpatterns = [
    path("auth/login/", AdminLoginView.as_view(), name="admin-login"),
    path("auth/logout/", AdminLogoutView.as_view(), name="admin-logout"),
    path("auth/student/register/", StudentRegistrationView.as_view(), name="student-register"),
    path("auth/student/login/", StudentLoginView.as_view(), name="student-login"),
    path("student-profile/", StudentProfileView.as_view(), name="student-profile"),
] + router.urls
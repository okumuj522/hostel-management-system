from rest_framework.permissions import SAFE_METHODS, BasePermission
from django.core.exceptions import ObjectDoesNotExist


class IsLinkedStudent(BasePermission):
    def has_permission(self, request, view):
        if not request.user.is_authenticated or request.user.is_staff:
            return False
        try:
            return request.user.hostel_profile is not None
        except ObjectDoesNotExist:
            return False


class IsStaffOrStudentReadOnly(BasePermission):
    def has_permission(self, request, view):
        if request.user.is_staff:
            return True
        return request.method in SAFE_METHODS and IsLinkedStudent().has_permission(request, view)


class IsStaffOrStudentCreateReadOnly(BasePermission):
    def has_permission(self, request, view):
        if request.user.is_staff:
            return True
        return (
            request.method in SAFE_METHODS or request.method == "POST"
        ) and IsLinkedStudent().has_permission(request, view)

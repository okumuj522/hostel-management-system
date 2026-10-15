from django.contrib.auth import authenticate
from django.db.models.deletion import ProtectedError
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.authentication import TokenAuthentication
from rest_framework.authtoken.models import Token
from rest_framework.exceptions import APIException
from rest_framework.permissions import AllowAny, IsAdminUser, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import (
    Hall, Room, Student, Semester,
    Application, Allocation, TransferRequest,
    MaintenanceRecord
)
from .serializers import (
    HallSerializer, RoomSerializer, StudentSerializer,
    SemesterSerializer, ApplicationSerializer,
    AllocationSerializer, TransferRequestSerializer,
    MaintenanceRecordSerializer, StudentRegistrationSerializer,
    StudentProfileSerializer, StudentApplicationSerializer,
    StudentTransferSerializer, StudentMaintenanceSerializer,
)
from .permissions import (
    IsLinkedStudent,
    IsStaffOrStudentCreateReadOnly,
    IsStaffOrStudentReadOnly,
)


class ProtectedDeleteConflict(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "This record is still referenced by other hostel records."
    default_code = "protected_delete"


class ProtectedDeleteModelViewSet(viewsets.ModelViewSet):
    def perform_destroy(self, instance):
        try:
            instance.delete()
        except ProtectedError as error:
            raise ProtectedDeleteConflict() from error


class HallViewSet(ProtectedDeleteModelViewSet):
    queryset = Hall.objects.all()
    serializer_class = HallSerializer
    permission_classes = [IsStaffOrStudentReadOnly]


class RoomViewSet(ProtectedDeleteModelViewSet):
    queryset = Room.objects.all()
    serializer_class = RoomSerializer
    permission_classes = [IsStaffOrStudentReadOnly]


class StudentViewSet(ProtectedDeleteModelViewSet):
    queryset = Student.objects.all()
    serializer_class = StudentSerializer
    permission_classes = [IsAdminUser]


class SemesterViewSet(ProtectedDeleteModelViewSet):
    queryset = Semester.objects.all()
    serializer_class = SemesterSerializer
    permission_classes = [IsStaffOrStudentReadOnly]

    def get_queryset(self):
        if self.request.query_params.get("open_for_applications") == "true":
            return Semester.objects.filter(application_deadline__gte=timezone.localdate())
        return Semester.objects.all()


class ApplicationViewSet(ProtectedDeleteModelViewSet):
    queryset = Application.objects.all()
    serializer_class = ApplicationSerializer
    permission_classes = [IsStaffOrStudentCreateReadOnly]

    def get_queryset(self):
        if self.request.user.is_staff:
            return Application.objects.all()
        return Application.objects.filter(student=self.request.user.hostel_profile)

    def get_serializer_class(self):
        if self.request.user.is_staff:
            return ApplicationSerializer
        return StudentApplicationSerializer

    def perform_create(self, serializer):
        if self.request.user.is_staff:
            serializer.save()
        else:
            serializer.save(student=self.request.user.hostel_profile)


class AllocationViewSet(ProtectedDeleteModelViewSet):
    queryset = Allocation.objects.all()
    serializer_class = AllocationSerializer
    permission_classes = [IsStaffOrStudentReadOnly]

    def get_queryset(self):
        if self.request.user.is_staff:
            return Allocation.objects.select_related("student", "room", "semester")
        return Allocation.objects.filter(student=self.request.user.hostel_profile).select_related(
            "room", "room__hall", "semester"
        )


class TransferRequestViewSet(ProtectedDeleteModelViewSet):
    queryset = TransferRequest.objects.all()
    serializer_class = TransferRequestSerializer
    permission_classes = [IsStaffOrStudentCreateReadOnly]

    def get_queryset(self):
        if self.request.user.is_staff:
            return TransferRequest.objects.all()
        return TransferRequest.objects.filter(allocation__student=self.request.user.hostel_profile)

    def get_serializer_class(self):
        if self.request.user.is_staff:
            return TransferRequestSerializer
        return StudentTransferSerializer


class MaintenanceRecordViewSet(ProtectedDeleteModelViewSet):
    queryset = MaintenanceRecord.objects.all()
    serializer_class = MaintenanceRecordSerializer
    permission_classes = [IsStaffOrStudentCreateReadOnly]

    def get_queryset(self):
        if self.request.user.is_staff:
            return MaintenanceRecord.objects.all()
        return MaintenanceRecord.objects.filter(reported_by=self.request.user.hostel_profile)

    def get_serializer_class(self):
        if self.request.user.is_staff:
            return MaintenanceRecordSerializer
        return StudentMaintenanceSerializer

    def perform_create(self, serializer):
        if self.request.user.is_staff:
            serializer.save()
        else:
            serializer.save(reported_by=self.request.user.hostel_profile)


class AdminLoginView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        user = authenticate(
            request,
            username=request.data.get("username", ""),
            password=request.data.get("password", ""),
        )
        if user is None or not user.is_active or not user.is_staff:
            return Response(
                {"detail": "Invalid administrator credentials."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        token, _ = Token.objects.get_or_create(user=user)
        return Response({"token": token.key, "username": user.get_username()})


class AdminLogoutView(APIView):
    authentication_classes = [TokenAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        request.auth.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class StudentRegistrationView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = StudentRegistrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        token, _ = Token.objects.get_or_create(user=user)
        student = user.hostel_profile
        return Response(
            {"token": token.key, "username": student.student_number, "full_name": student.full_name},
            status=status.HTTP_201_CREATED,
        )


class StudentLoginView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        student_number = request.data.get("student_number", "")
        if not isinstance(student_number, str):
            student_number = ""
        student = Student.objects.select_related("user").filter(
            student_number=student_number.strip()
        ).first()
        user = None
        if student and student.user_id:
            user = authenticate(
                request,
                username=student.user.get_username(),
                password=request.data.get("password", ""),
            )
        if user is None or not user.is_active or user.is_staff:
            return Response(
                {"detail": "Invalid student number or password."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        token, _ = Token.objects.get_or_create(user=user)
        return Response(
            {"token": token.key, "username": student.student_number, "full_name": student.full_name}
        )


class StudentProfileView(APIView):
    permission_classes = [IsLinkedStudent]

    def get(self, request):
        return Response(StudentProfileSerializer(request.user.hostel_profile).data)

    def patch(self, request):
        serializer = StudentProfileSerializer(
            request.user.hostel_profile,
            data=request.data,
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)
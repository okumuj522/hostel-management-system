from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils import timezone
from .models import (
    Hall, Room, Student, Semester,
    Application, Allocation, TransferRequest,
    MaintenanceRecord
)


class HallSerializer(serializers.ModelSerializer):
    class Meta:
        model = Hall
        fields = "__all__"


class RoomSerializer(serializers.ModelSerializer):
    occupied_beds = serializers.SerializerMethodField()
    available_beds = serializers.SerializerMethodField()

    class Meta:
        model = Room
        fields = [
            "id", "hall", "room_number", "room_type", "capacity",
            "is_available", "occupied_beds", "available_beds",
        ]

    def get_occupied_beds(self, room):
        today = timezone.localdate()
        return room.allocations.filter(
            status__in=("pending", "confirmed"),
            semester__start_date__lte=today,
            semester__end_date__gte=today,
        ).count()

    def get_available_beds(self, room):
        if not room.is_available:
            return 0
        return max(room.capacity - self.get_occupied_beds(room), 0)


class StudentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Student
        fields = "__all__"
        extra_kwargs = {"user": {"read_only": True}}


class SemesterSerializer(serializers.ModelSerializer):
    class Meta:
        model = Semester
        fields = "__all__"


class ApplicationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Application
        fields = "__all__"


class AllocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Allocation
        fields = "__all__"

    def validate(self, attrs):
        allocation = self.instance
        student = attrs.get("student", getattr(allocation, "student", None))
        room = attrs.get("room", getattr(allocation, "room", None))
        semester = attrs.get("semester", getattr(allocation, "semester", None))
        state = attrs.get("status", getattr(allocation, "status", "pending"))

        if state not in ("pending", "confirmed"):
            return attrs
        if not room.is_available:
            raise serializers.ValidationError({"room": "This room is not accepting allocations."})

        active = Allocation.objects.filter(
            room=room,
            status__in=("pending", "confirmed"),
            semester__start_date__lte=semester.end_date,
            semester__end_date__gte=semester.start_date,
        )
        conflicts = Allocation.objects.filter(
            student=student,
            semester=semester,
            status__in=("pending", "confirmed"),
        )
        if allocation:
            active = active.exclude(pk=allocation.pk)
            conflicts = conflicts.exclude(pk=allocation.pk)
        if active.count() >= room.capacity:
            raise serializers.ValidationError({"room": "This room has no available beds."})
        if conflicts.exists():
            raise serializers.ValidationError({"student": "This student already has an active allocation for this semester."})
        return attrs


class TransferRequestSerializer(serializers.ModelSerializer):
    class Meta:
        model = TransferRequest
        fields = "__all__"


class MaintenanceRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = MaintenanceRecord
        fields = "__all__"
        extra_kwargs = {"reported_by": {"read_only": True}}


class StudentRegistrationSerializer(serializers.Serializer):
    student_number = serializers.CharField(max_length=20)
    phone_number = serializers.CharField(max_length=20)
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    password_confirm = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate(self, attrs):
        try:
            student = Student.objects.get(student_number=attrs["student_number"].strip())
        except Student.DoesNotExist as error:
            raise serializers.ValidationError({"student_number": "No matching student record. Contact the hostel administrator."}) from error

        if not student.phone_number or student.phone_number.strip() != attrs["phone_number"].strip():
            raise serializers.ValidationError({"detail": "Student details could not be verified."})
        if student.user_id:
            raise serializers.ValidationError({"student_number": "An account is already linked to this student record."})
        if attrs["password"] != attrs["password_confirm"]:
            raise serializers.ValidationError({"password_confirm": "Passwords do not match."})

        username = f"student-{student.student_number}"
        User = get_user_model()
        if User.objects.filter(username=username).exists():
            raise serializers.ValidationError({"student_number": "An account already exists for this student."})
        try:
            validate_password(attrs["password"], user=User(username=username))
        except DjangoValidationError as error:
            raise serializers.ValidationError({"password": error.messages}) from error
        attrs["student"] = student
        return attrs

    def create(self, validated_data):
        User = get_user_model()
        student = validated_data["student"]
        with transaction.atomic():
            student = Student.objects.select_for_update().get(pk=student.pk)
            if student.user_id:
                raise serializers.ValidationError({"student_number": "An account is already linked to this student record."})
            user = User.objects.create_user(
                username=f"student-{student.student_number}",
                password=validated_data["password"],
                is_staff=False,
            )
            student.user = user
            student.save(update_fields=["user"])
        return user


class StudentProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = Student
        fields = ["id", "student_number", "full_name", "gender", "year_of_study", "phone_number"]
        read_only_fields = ["id", "student_number"]


class StudentApplicationSerializer(serializers.ModelSerializer):
    semester = serializers.PrimaryKeyRelatedField(
        queryset=Semester.objects.all()
    )
    preferred_hall = serializers.PrimaryKeyRelatedField(
        queryset=Hall.objects.all(), required=False, allow_null=True
    )

    class Meta:
        model = Application
        fields = ["id", "student", "semester", "preferred_hall", "preferred_room_type", "application_date", "status"]
        read_only_fields = ["id", "student", "application_date", "status"]

    def validate(self, attrs):
        student = self.context["request"].user.hostel_profile
        semester = attrs["semester"]
        if semester.application_deadline < timezone.localdate():
            raise serializers.ValidationError({"semester": "The application deadline has passed."})
        if Application.objects.filter(student=student, semester=semester).exists():
            raise serializers.ValidationError({"semester": "You have already applied for this semester."})
        return attrs


class StudentTransferSerializer(serializers.ModelSerializer):
    class Meta:
        model = TransferRequest
        fields = ["id", "allocation", "requested_room", "reason", "request_date", "status"]
        read_only_fields = ["id", "request_date", "status"]

    def validate(self, attrs):
        student = self.context["request"].user.hostel_profile
        allocation = attrs["allocation"]
        requested_room = attrs["requested_room"]
        if allocation.student_id != student.id or allocation.status not in ("pending", "confirmed"):
            raise serializers.ValidationError({"allocation": "Choose one of your active allocations."})
        if requested_room.pk == allocation.room_id:
            raise serializers.ValidationError({"requested_room": "Choose a different room."})
        if not requested_room.is_available:
            raise serializers.ValidationError({"requested_room": "This room is not available for transfer."})
        occupied = requested_room.allocations.filter(
            status__in=("pending", "confirmed"),
            semester__start_date__lte=allocation.semester.end_date,
            semester__end_date__gte=allocation.semester.start_date,
        ).count()
        if occupied >= requested_room.capacity:
            raise serializers.ValidationError({"requested_room": "This room has no available beds."})
        if TransferRequest.objects.filter(allocation=allocation, status="pending").exists():
            raise serializers.ValidationError({"allocation": "A transfer request is already pending for this allocation."})
        return attrs


class StudentMaintenanceSerializer(serializers.ModelSerializer):
    class Meta:
        model = MaintenanceRecord
        fields = ["id", "room", "description", "reported_date", "status"]
        read_only_fields = ["id", "reported_date", "status"]

    def validate_room(self, room):
        student = self.context["request"].user.hostel_profile
        if not Allocation.objects.filter(
            student=student,
            room=room,
            status__in=("pending", "confirmed"),
        ).exists():
            raise serializers.ValidationError("Maintenance can only be reported for your current room.")
        return room
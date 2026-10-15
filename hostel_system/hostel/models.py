from django.db import models
from django.conf import settings


class Hall(models.Model):
    name = models.CharField(max_length=100, unique=True)
    location = models.CharField(max_length=150, blank=True)

    GENDER_CHOICES = [
        ("male", "Male"),
        ("female", "Female"),
        ("mixed", "Mixed"),
    ]

    gender_policy = models.CharField(
        max_length=10,
        choices=GENDER_CHOICES,
        default="mixed",
    )

    def __str__(self):
        return self.name


class Room(models.Model):
    ROOM_TYPES = [
        ("single", "Single"),
        ("double", "Double"),
        ("shared", "Shared"),
    ]

    hall = models.ForeignKey(
        Hall,
        on_delete=models.CASCADE,
        related_name="rooms",
    )
    room_number = models.CharField(max_length=20)
    room_type = models.CharField(
        max_length=10,
        choices=ROOM_TYPES,
        default="single",
    )
    capacity = models.PositiveIntegerField(default=1)
    is_available = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["hall", "room_number"],
                name="unique_room_number_per_hall",
            )
        ]

    def __str__(self):
        return f"{self.hall.name} - {self.room_number}"


class Student(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="hostel_profile",
    )
    student_number = models.CharField(max_length=20, unique=True)
    full_name = models.CharField(max_length=150)
    gender = models.CharField(max_length=10, blank=True)
    year_of_study = models.PositiveIntegerField(default=1)
    phone_number = models.CharField(max_length=20, blank=True, default="")

    def __str__(self):
        return f"{self.student_number} - {self.full_name}"


class Semester(models.Model):
    name = models.CharField(max_length=100, unique=True)
    start_date = models.DateField()
    end_date = models.DateField()
    application_deadline = models.DateField()

    def __str__(self):
        return self.name


class Application(models.Model):
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("approved", "Approved"),
        ("rejected", "Rejected"),
        ("allocated", "Allocated"),
    ]

    student = models.ForeignKey(
        Student,
        on_delete=models.CASCADE,
        related_name="applications",
    )
    semester = models.ForeignKey(
        Semester,
        on_delete=models.CASCADE,
        related_name="applications",
    )
    preferred_hall = models.ForeignKey(
        Hall,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    preferred_room_type = models.CharField(
        max_length=10,
        choices=Room.ROOM_TYPES,
        default="single",
    )
    preferred_roommate = models.ForeignKey(
        Student,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="roommate_preferences",
    )
    application_date = models.DateTimeField(auto_now_add=True)
    status = models.CharField(
        max_length=10,
        choices=STATUS_CHOICES,
        default="pending",
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["student", "semester"],
                name="unique_student_application_per_semester",
            )
        ]

    def __str__(self):
        return f"{self.student} - {self.semester}"


class Allocation(models.Model):
    STATUS_CHOICES = [
        ("pending", "Pending confirmation"),
        ("confirmed", "Confirmed"),
        ("expired", "Expired"),
        ("vacated", "Vacated"),
        ("cancelled", "Cancelled"),
    ]

    student = models.ForeignKey(
        Student,
        on_delete=models.PROTECT,
        related_name="allocations",
    )
    room = models.ForeignKey(
        Room,
        on_delete=models.PROTECT,
        related_name="allocations",
    )
    semester = models.ForeignKey(
        Semester,
        on_delete=models.PROTECT,
        related_name="allocations",
    )
    allocation_date = models.DateTimeField(auto_now_add=True)
    confirmation_deadline = models.DateTimeField(null=True, blank=True)
    status = models.CharField(
        max_length=12,
        choices=STATUS_CHOICES,
        default="pending",
    )

    def __str__(self):
        return f"{self.student} - {self.room}"


class TransferRequest(models.Model):
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("approved", "Approved"),
        ("rejected", "Rejected"),
    ]

    allocation = models.ForeignKey(
        Allocation,
        on_delete=models.PROTECT,
        related_name="transfer_requests",
    )
    requested_room = models.ForeignKey(
        Room,
        on_delete=models.PROTECT,
        related_name="transfer_requests",
    )
    reason = models.TextField(blank=True)
    request_date = models.DateTimeField(auto_now_add=True)
    status = models.CharField(
        max_length=10,
        choices=STATUS_CHOICES,
        default="pending",
    )

    def __str__(self):
        return f"Transfer request - {self.allocation.student}"


class MaintenanceRecord(models.Model):
    STATUS_CHOICES = [
        ("reported", "Reported"),
        ("in_progress", "In progress"),
        ("completed", "Completed"),
    ]

    room = models.ForeignKey(
        Room,
        on_delete=models.PROTECT,
        related_name="maintenance_records",
    )
    reported_by = models.ForeignKey(
        Student,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="maintenance_records",
    )
    description = models.TextField()
    reported_date = models.DateTimeField(auto_now_add=True)
    status = models.CharField(
        max_length=15,
        choices=STATUS_CHOICES,
        default="reported",
    )

    def __str__(self):
        return f"{self.room} - {self.status}"
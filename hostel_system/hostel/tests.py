import os
from datetime import timedelta
from io import StringIO
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.management import call_command, CommandError
from django.test import TestCase
from django.utils import timezone
from .models import Allocation, Hall, MaintenanceRecord, Room, Semester, Student, TransferRequest
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase


class ResetAdminPasswordCommandTests(TestCase):
	def test_creates_configured_superuser_without_logging_password(self):
		password = "new-admin-password-123"
		output = StringIO()
		with patch.dict(
			os.environ,
			{
				"DJANGO_SUPERUSER_USERNAME": "hosteladmin",
				"DJANGO_ADMIN_RESET_PASSWORD": password,
			},
		):
			call_command("reset_admin_password", stdout=output)

		admin = get_user_model().objects.get(username="hosteladmin")
		self.assertTrue(admin.check_password(password))
		self.assertTrue(admin.is_active)
		self.assertTrue(admin.is_staff)
		self.assertTrue(admin.is_superuser)
		self.assertNotIn(password, output.getvalue())

	def test_resets_existing_account_and_requires_reset_password(self):
		admin = get_user_model().objects.create_user(
			username="hosteladmin",
			password="old-password",
			is_staff=False,
		)
		Token.objects.create(user=admin)
		with patch.dict(
			os.environ,
			{
				"DJANGO_SUPERUSER_USERNAME": "hosteladmin",
				"DJANGO_ADMIN_RESET_PASSWORD": "replacement-password-456",
			},
		):
			call_command("reset_admin_password", stdout=StringIO())

		admin.refresh_from_db()
		self.assertTrue(admin.check_password("replacement-password-456"))
		self.assertTrue(admin.is_staff)
		self.assertTrue(admin.is_superuser)
		self.assertFalse(Token.objects.filter(user=admin).exists())

		with patch.dict(
			os.environ,
			{"DJANGO_SUPERUSER_USERNAME": "hosteladmin"},
			clear=False,
		):
			os.environ.pop("DJANGO_ADMIN_RESET_PASSWORD", None)
			with self.assertRaises(CommandError):
				call_command("reset_admin_password", stdout=StringIO())


class AdminApiTests(APITestCase):
	def setUp(self):
		self.admin = get_user_model().objects.create_user(
			username="hostel-admin",
			password="test-password-123",
			is_staff=True,
		)

	def test_resource_api_requires_admin_authentication(self):
		response = self.client.get("/api/halls/")
		self.assertEqual(response.status_code, 401)

	def test_staff_login_and_authenticated_crud(self):
		login = self.client.post(
			"/api/auth/login/",
			{"username": "hostel-admin", "password": "test-password-123"},
			format="json",
		)
		self.assertEqual(login.status_code, 200)
		self.client.credentials(HTTP_AUTHORIZATION="Token " + login.data["token"])

		created = self.client.post(
			"/api/halls/",
			{"name": "North Hall", "location": "Campus north", "gender_policy": "mixed"},
			format="json",
		)
		self.assertEqual(created.status_code, 201)
		self.assertEqual(created.data["name"], "North Hall")

	def test_non_staff_user_cannot_obtain_admin_token(self):
		get_user_model().objects.create_user(
			username="student-user",
			password="test-password-123",
		)
		response = self.client.post(
			"/api/auth/login/",
			{"username": "student-user", "password": "test-password-123"},
			format="json",
		)
		self.assertEqual(response.status_code, 401)

	def test_all_resource_endpoints_support_crud(self):
		login = self.client.post(
			"/api/auth/login/",
			{"username": "hostel-admin", "password": "test-password-123"},
			format="json",
		)
		self.client.credentials(HTTP_AUTHORIZATION="Token " + login.data["token"])

		def create(endpoint, values):
			response = self.client.post(f"/api/{endpoint}/", values, format="json")
			self.assertEqual(response.status_code, 201, response.data)
			return response.data

		hall = create("halls", {"name": "North Hall", "location": "North", "gender_policy": "mixed"})
		room = create("rooms", {"hall": hall["id"], "room_number": "101", "room_type": "single", "capacity": 1, "is_available": True})
		student = create("students", {"student_number": "S-101", "full_name": "Ada Student", "gender": "", "year_of_study": 1, "phone_number": ""})
		semester = create("semesters", {"name": "Autumn 2026", "start_date": "2026-09-01", "end_date": "2026-12-20", "application_deadline": "2026-08-01"})
		application = create("applications", {"student": student["id"], "semester": semester["id"], "preferred_hall": hall["id"], "preferred_room_type": "single", "preferred_roommate": None, "status": "pending"})
		allocation = create("allocations", {"student": student["id"], "room": room["id"], "semester": semester["id"], "confirmation_deadline": None, "status": "pending"})
		transfer = create("transfers", {"allocation": allocation["id"], "requested_room": room["id"], "reason": "Closer to classes", "status": "pending"})
		maintenance = create("maintenance", {"room": room["id"], "description": "Replace desk lamp", "status": "reported"})

		updates = [
			("halls", hall, {"name": "North Hall Updated", "location": "North", "gender_policy": "mixed"}),
			("rooms", room, {"hall": hall["id"], "room_number": "101", "room_type": "single", "capacity": 1, "is_available": True}),
			("students", student, {"student_number": "S-101", "full_name": "Ada Student", "gender": "", "year_of_study": 2, "phone_number": ""}),
			("semesters", semester, {"name": "Autumn 2026", "start_date": "2026-09-01", "end_date": "2026-12-20", "application_deadline": "2026-08-01"}),
			("applications", application, {"student": student["id"], "semester": semester["id"], "preferred_hall": hall["id"], "preferred_room_type": "single", "preferred_roommate": None, "status": "approved"}),
			("allocations", allocation, {"student": student["id"], "room": room["id"], "semester": semester["id"], "confirmation_deadline": None, "status": "confirmed"}),
			("transfers", transfer, {"allocation": allocation["id"], "requested_room": room["id"], "reason": "Updated reason", "status": "approved"}),
			("maintenance", maintenance, {"room": room["id"], "description": "Replace desk lamp", "status": "completed"}),
		]
		for endpoint, record, values in updates:
			response = self.client.put(f"/api/{endpoint}/{record['id']}/", values, format="json")
			self.assertEqual(response.status_code, 200, response.data)

		protected = self.client.delete(f"/api/rooms/{room['id']}/")
		self.assertEqual(protected.status_code, 409)
		self.assertIn("referenced", protected.data["detail"])

		for endpoint, record in [
			("maintenance", maintenance),
			("transfers", transfer),
			("allocations", allocation),
			("applications", application),
			("rooms", room),
			("halls", hall),
			("students", student),
			("semesters", semester),
		]:
			response = self.client.delete(f"/api/{endpoint}/{record['id']}/")
			self.assertEqual(response.status_code, 204)


class StudentPortalApiTests(APITestCase):
	password = "Secure-Portal-Password-2026!"

	def setUp(self):
		self.student = Student.objects.create(
			student_number="ST-1001",
			full_name="Student One",
			phone_number="0700001001",
			year_of_study=2,
		)
		self.other_student = Student.objects.create(
			student_number="ST-1002",
			full_name="Student Two",
			phone_number="0700001002",
			year_of_study=1,
		)
		self.hall = Hall.objects.create(name="North Hall", gender_policy="mixed")
		self.room = Room.objects.create(
			hall=self.hall,
			room_number="101",
			room_type="single",
			capacity=1,
		)
		self.second_room = Room.objects.create(
			hall=self.hall,
			room_number="102",
			room_type="double",
			capacity=1,
		)
		self.open_room = Room.objects.create(
			hall=self.hall,
			room_number="103",
			room_type="shared",
			capacity=2,
		)
		self.semester = Semester.objects.create(
			name="Current semester",
			start_date=timezone.localdate(),
			end_date=timezone.localdate() + timedelta(days=120),
			application_deadline=timezone.localdate() + timedelta(days=30),
		)

	def register_student(self, student):
		response = self.client.post(
			"/api/auth/student/register/",
			{
				"student_number": student.student_number,
				"phone_number": student.phone_number,
				"password": self.password,
				"password_confirm": self.password,
			},
			format="json",
		)
		self.assertEqual(response.status_code, 201, response.data)
		return response.data

	def authenticate_student(self, student):
		result = self.register_student(student)
		self.client.credentials(HTTP_AUTHORIZATION="Token " + result["token"])
		return result

	def test_registration_links_student_and_login_uses_linked_account(self):
		result = self.register_student(self.student)
		self.student.refresh_from_db()
		self.assertIsNotNone(self.student.user_id)
		self.assertFalse(self.student.user.is_staff)

		login = self.client.post(
			"/api/auth/student/login/",
			{"student_number": self.student.student_number, "password": self.password},
			format="json",
		)
		self.assertEqual(login.status_code, 200)
		self.assertTrue(login.data["token"])
		self.assertEqual(login.data["username"], self.student.student_number)
		self.assertNotEqual(result["token"], "")

		wrong_password = self.client.post(
			"/api/auth/student/login/",
			{"student_number": self.student.student_number, "password": "wrong"},
			format="json",
		)
		self.assertEqual(wrong_password.status_code, 401)

	def test_registration_requires_matching_preexisting_student_details(self):
		response = self.client.post(
			"/api/auth/student/register/",
			{
				"student_number": self.student.student_number,
				"phone_number": "0700009999",
				"password": self.password,
				"password_confirm": self.password,
			},
			format="json",
		)
		self.assertEqual(response.status_code, 400)
		self.assertIsNone(self.student.user_id)

		weak_password = self.client.post(
			"/api/auth/student/register/",
			{
				"student_number": self.student.student_number,
				"phone_number": self.student.phone_number,
				"password": "password",
				"password_confirm": "password",
			},
			format="json",
		)
		self.assertEqual(weak_password.status_code, 400)
		self.assertIn("password", weak_password.data)

	def test_students_can_only_read_and_create_their_own_applications(self):
		other_application = self.other_student.applications.create(semester=self.semester)
		closed_semester = Semester.objects.create(
			name="Closed semester",
			start_date=timezone.localdate() - timedelta(days=30),
			end_date=timezone.localdate() + timedelta(days=90),
			application_deadline=timezone.localdate() - timedelta(days=1),
		)
		self.authenticate_student(self.student)

		open_semesters = self.client.get("/api/semesters/?open_for_applications=true")
		self.assertEqual([item["id"] for item in open_semesters.data], [self.semester.id])

		created = self.client.post(
			"/api/applications/",
			{
				"student": self.other_student.id,
				"semester": self.semester.id,
				"preferred_hall": self.hall.id,
				"preferred_room_type": "single",
				"status": "approved",
			},
			format="json",
		)
		self.assertEqual(created.status_code, 201, created.data)
		self.assertEqual(created.data["status"], "pending")
		self.assertEqual(created.data["student"], self.student.id)

		listed = self.client.get("/api/applications/")
		self.assertEqual([item["id"] for item in listed.data], [created.data["id"]])
		self.assertEqual(self.client.get(f"/api/applications/{other_application.id}/").status_code, 404)
		self.assertEqual(self.client.patch(f"/api/applications/{created.data['id']}/", {"status": "approved"}, format="json").status_code, 403)
		self.assertEqual(self.client.delete(f"/api/applications/{created.data['id']}/").status_code, 403)
		self.assertEqual(self.client.post("/api/applications/", {"semester": self.semester.id}, format="json").status_code, 400)
		expired = self.client.post("/api/applications/", {"semester": closed_semester.id}, format="json")
		self.assertEqual(expired.status_code, 400)

	def test_profile_is_self_service_and_student_directory_is_private(self):
		self.authenticate_student(self.student)
		self.assertEqual(self.client.get("/api/students/").status_code, 403)
		update = self.client.patch(
			"/api/student-profile/",
			{"student_number": self.other_student.student_number, "full_name": "Updated Name", "phone_number": "0700001010"},
			format="json",
		)
		self.assertEqual(update.status_code, 200)
		self.assertEqual(update.data["student_number"], self.student.student_number)
		self.assertEqual(update.data["full_name"], "Updated Name")
		self.other_student.refresh_from_db()
		self.assertIsNone(self.other_student.user_id)

	def test_allocations_are_read_only_scoped_and_capacity_checked(self):
		own = Allocation.objects.create(
			student=self.student,
			room=self.room,
			semester=self.semester,
			status="confirmed",
		)
		other = Allocation.objects.create(
			student=self.other_student,
			room=self.second_room,
			semester=self.semester,
			status="confirmed",
		)
		self.authenticate_student(self.student)
		listed = self.client.get("/api/allocations/")
		self.assertEqual([item["id"] for item in listed.data], [own.id])
		self.assertEqual(self.client.get(f"/api/allocations/{other.id}/").status_code, 404)
		self.assertEqual(self.client.post("/api/allocations/", {}, format="json").status_code, 403)

		admin = get_user_model().objects.create_user(
			username="capacity-admin", password=self.password, is_staff=True
		)
		admin_login = self.client.post(
			"/api/auth/login/",
			{"username": admin.username, "password": self.password},
			format="json",
		)
		self.client.credentials(HTTP_AUTHORIZATION="Token " + admin_login.data["token"])
		future_semester = Semester.objects.create(
			name="Future semester",
			start_date=timezone.localdate() + timedelta(days=180),
			end_date=timezone.localdate() + timedelta(days=300),
			application_deadline=timezone.localdate() + timedelta(days=150),
		)
		future_allocation = self.client.post(
			"/api/allocations/",
			{"student": self.other_student.id, "room": self.room.id, "semester": future_semester.id, "status": "pending"},
			format="json",
		)
		self.assertEqual(future_allocation.status_code, 201, future_allocation.data)
		no_bed = self.client.post(
			"/api/allocations/",
			{"student": self.other_student.id, "room": self.room.id, "semester": self.semester.id, "status": "pending"},
			format="json",
		)
		self.assertEqual(no_bed.status_code, 400)
		self.assertIn("available beds", str(no_bed.data).lower())

	def test_transfer_and_maintenance_requests_are_owned_and_validated(self):
		own = Allocation.objects.create(
			student=self.student,
			room=self.room,
			semester=self.semester,
			status="confirmed",
		)
		other = Allocation.objects.create(
			student=self.other_student,
			room=self.second_room,
			semester=self.semester,
			status="confirmed",
		)
		other_transfer = TransferRequest.objects.create(
			allocation=other,
			requested_room=self.open_room,
			reason="Other student's request",
		)
		other_maintenance = MaintenanceRecord.objects.create(
			room=self.second_room,
			reported_by=self.other_student,
			description="Other student's issue",
		)
		self.authenticate_student(self.student)

		transfer = self.client.post(
			"/api/transfers/",
			{"allocation": own.id, "requested_room": self.open_room.id, "reason": "Closer to classes"},
			format="json",
		)
		self.assertEqual(transfer.status_code, 201, transfer.data)
		self.assertEqual(transfer.data["status"], "pending")
		self.assertEqual(self.client.get("/api/transfers/").data[0]["id"], transfer.data["id"])
		self.assertEqual(self.client.get(f"/api/transfers/{other_transfer.id}/").status_code, 404)
		self.assertEqual(self.client.patch(f"/api/transfers/{transfer.data['id']}/", {"status": "approved"}, format="json").status_code, 403)
		self.assertEqual(
			self.client.post("/api/transfers/", {"allocation": other.id, "requested_room": self.open_room.id}, format="json").status_code,
			400,
		)

		forbidden_room = self.client.post(
			"/api/maintenance/",
			{"room": self.second_room.id, "description": "Broken light"},
			format="json",
		)
		self.assertEqual(forbidden_room.status_code, 400)
		maintenance = self.client.post(
			"/api/maintenance/",
			{"room": self.room.id, "description": "Broken light", "status": "completed"},
			format="json",
		)
		self.assertEqual(maintenance.status_code, 201, maintenance.data)
		self.assertEqual(maintenance.data["status"], "reported")
		self.assertEqual(self.client.get("/api/maintenance/").data[0]["id"], maintenance.data["id"])
		self.assertEqual(self.client.get(f"/api/maintenance/{other_maintenance.id}/").status_code, 404)

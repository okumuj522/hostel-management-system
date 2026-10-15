# Hostel Booking System

Hostel administration dashboard and student portal built with React, Vite, Django REST Framework, and SQLite.

## Start the backend

In PowerShell, from the workspace root:

```powershell
cd .\hostel_system
python -m pip install Django djangorestframework django-cors-headers
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

The administrator dashboard accepts Django staff or superuser accounts. Student registration links to an existing student record, matching its student number and phone number. Create or verify student records in the administrator dashboard before students register. Keep the backend running in this terminal.

## Start the frontend

Open a second terminal from the workspace root:

```powershell
cd .\frontend
npm.cmd install
npm.cmd run dev
```

Open `http://localhost:5173/`. In PowerShell, use `npm.cmd` if script execution policy blocks `npm`.

The frontend uses `http://127.0.0.1:8000/api` by default. To use another API base, create `frontend/.env` with:

```text
VITE_API_URL=http://127.0.0.1:8000/api
```

## Verify changes

Run backend tests and checks:

```powershell
cd .\hostel_system
python manage.py test hostel
python manage.py check
python manage.py makemigrations --check --dry-run
```

Run frontend lint and production build:

```powershell
cd .\frontend
npm.cmd run lint
npm.cmd run build
```

The API requires token authentication for protected hostel resources. Administrator sign-in/out routes are `/api/auth/login/` and `/api/auth/logout/`. Student register/login routes are `/api/auth/student/register/` and `/api/auth/student/login/`; the student profile is available at `/api/student-profile/`.

Applications remain pending until an administrator reviews them. Allocation and room assignment are administrator-controlled, and the API checks room capacity before an active allocation is created. Run `python manage.py migrate` after pulling changes to add student-account and maintenance ownership fields.

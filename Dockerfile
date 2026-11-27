FROM node:22-alpine AS frontend-build

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app
COPY hostel_system/requirements.txt /app/hostel_system/requirements.txt
RUN pip install --no-cache-dir -r /app/hostel_system/requirements.txt
COPY hostel_system/ /app/hostel_system/
COPY --from=frontend-build /app/frontend/dist/ /app/frontend/dist/

WORKDIR /app/hostel_system
RUN python manage.py collectstatic --noinput

EXPOSE 10000
CMD ["sh", "-c", "python manage.py migrate && gunicorn hostel_system.wsgi:application --bind 0.0.0.0:${PORT:-10000}"]

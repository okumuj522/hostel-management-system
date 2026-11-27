import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from rest_framework.authtoken.models import Token


class Command(BaseCommand):
    help = "Reset the configured administrator password."

    def handle(self, *args, **options):
        username = os.environ.get("DJANGO_SUPERUSER_USERNAME")
        password = os.environ.get("DJANGO_ADMIN_RESET_PASSWORD")
        if not username or not password:
            raise CommandError(
                "DJANGO_SUPERUSER_USERNAME and DJANGO_ADMIN_RESET_PASSWORD must be set."
            )

        user_model = get_user_model()
        try:
            user = user_model._default_manager.get(username=username)
        except user_model.DoesNotExist:
            user = user_model._default_manager.create_superuser(
                username=username,
                password=password,
            )
        else:
            user.set_password(password)
            user.is_active = True
            user.is_staff = True
            user.is_superuser = True
            user.save(
                update_fields=("password", "is_active", "is_staff", "is_superuser")
            )

        Token.objects.filter(user=user).delete()
        self.stdout.write(self.style.SUCCESS("Administrator password reset completed."))

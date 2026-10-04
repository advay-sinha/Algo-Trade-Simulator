"""Auth request models."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, EmailStr, Field, field_validator

from backend.models.common import PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, check_password_policy


class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=PASSWORD_MIN_LENGTH, max_length=PASSWORD_MAX_LENGTH)
    name: str = Field(min_length=1, max_length=120)

    @field_validator("password")
    @classmethod
    def password_not_common(cls, value: str) -> str:
        return check_password_policy(value)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(max_length=PASSWORD_MAX_LENGTH)


class DevAuthBypassRequest(BaseModel):
    email: Optional[EmailStr] = None
    name: Optional[str] = Field(default=None, max_length=120)

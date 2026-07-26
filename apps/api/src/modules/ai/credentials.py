from __future__ import annotations

from cryptography.fernet import Fernet, InvalidToken

from .errors import AiDomainError


class CredentialCipher:
    def __init__(self, key: str | None):
        self._fernet = Fernet(key.encode("ascii")) if key else None

    def encrypt(self, value: str) -> str:
        if self._fernet is None:
            raise AiDomainError(
                "AI_CREDENTIAL_ENCRYPTION_UNAVAILABLE",
                "Personal API keys cannot be saved until credential encryption is configured.",
                status_code=503,
            )
        return self._fernet.encrypt(value.encode("utf-8")).decode("ascii")

    def decrypt(self, value: str) -> str:
        if self._fernet is None:
            raise AiDomainError(
                "AI_CREDENTIAL_ENCRYPTION_UNAVAILABLE",
                "Personal API keys cannot be read until credential encryption is configured.",
                status_code=503,
            )
        try:
            return self._fernet.decrypt(value.encode("ascii")).decode("utf-8")
        except InvalidToken as exc:
            raise AiDomainError(
                "AI_CREDENTIAL_DECRYPTION_FAILED",
                "The saved provider credential could not be decrypted.",
                status_code=500,
            ) from exc

    @staticmethod
    def hint(value: str) -> str:
        return f"••••{value[-4:]}" if len(value) >= 4 else "••••"

"""Normalization shared with the legacy login and account adapters."""

from .errors import IdentityDomainError
from .normalization import normalize_email, normalize_phone

__all__ = ['IdentityDomainError', 'normalize_email', 'normalize_phone']

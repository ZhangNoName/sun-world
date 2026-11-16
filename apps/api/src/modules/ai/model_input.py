"""Immutable measurements and per-issuer opaque, single-use prepared inputs."""

from dataclasses import dataclass
import re
from threading import Lock
from weakref import WeakKeyDictionary, ref


@dataclass(frozen=True, slots=True)
class ModelInputLimits:
    max_input_tokens: int = 16384
    max_run_input_tokens: int = 32768
    count_timeout_seconds: int = 8
    max_count_response_bytes: int = 4096


MODEL_INPUT_LIMITS = ModelInputLimits()


def _invalid():
    raise ValueError('AGENT_MODEL_INPUT_INVALID') from None


@dataclass(frozen=True, slots=True)
class ModelInputMetadata:
    input_tokens: int
    wire_request_hash: str
    count_request_hash: str

    def __post_init__(self):
        if type(self.input_tokens) is not int or not 1 <= self.input_tokens <= 2147483647:
            _invalid()
        for value in (self.wire_request_hash, self.count_request_hash):
            if type(value) is not str or re.fullmatch(r'[0-9a-f]{64}', value) is None:
                _invalid()


class _PreparedHandle:
    __slots__ = ('__weakref__',)


@dataclass(slots=True, repr=False)
class _PreparedState:
    metadata: ModelInputMetadata
    wire: bytes
    used: bool = False


class _PreparedInputs:
    def __init__(self, owner):
        self._owner = ref(owner)
        self._states = WeakKeyDictionary()
        self._lock = Lock()

    def check(self, owner):
        if self._owner() is not owner:
            _invalid()

    def issue(self, owner, metadata, wire):
        handle = _PreparedHandle()
        with self._lock:
            self.check(owner)
            self._states[handle] = _PreparedState(metadata, wire)
        return handle

    def _state(self, handle):
        # Reject arbitrary __hash__/__eq__ implementations before dictionary access.
        if type(handle) is not _PreparedHandle:
            _invalid()
        state = self._states.get(handle)
        if state is None:
            _invalid()
        return state

    def metadata(self, owner, handle):
        with self._lock:
            self.check(owner)
            return self._state(handle).metadata

    def consume(self, owner, handle):
        # No await under the lock: concurrent event loops cannot consume twice.
        with self._lock:
            self.check(owner)
            state = self._state(handle)
            if state.used:
                _invalid()
            state.used = True
            if state.metadata.input_tokens > MODEL_INPUT_LIMITS.max_input_tokens:
                _invalid()
            return state

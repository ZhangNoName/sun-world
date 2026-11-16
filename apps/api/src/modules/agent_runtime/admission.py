"""Atomic, fail-closed Redis admission; no connection/config/environment loading.

This component does not start runs or grant tool permissions. The service checks
MySQL idempotency first and only claims a run after a newly returned lease. A lost
script acknowledgement never returns a guessed owner or retries a reservation.
"""

import hashlib
import json
import re
import secrets
from dataclasses import dataclass, field
from uuid import UUID

from .ledger import LedgerError


RESERVATION_TTL = 120
SLOT_TTL = 60
RATE_TTL = 60
MAX_LIMIT = 1_000_000

# All reads and type/value/TTL checks precede writes. In particular a poisoned
# later key cannot increment a valid earlier counter before raising WRONGTYPE.
_COMMON = r'''
local function integer(value, minimum, maximum)
  if type(value) ~= 'string' or not string.match(value, '^%d+$')
      or (#value > 1 and string.sub(value, 1, 1) == '0') or #value > 7 then return nil end
  local number = tonumber(value)
  if not number or number < minimum or number > maximum or number ~= math.floor(number) then return nil end
  return number
end
local function hex(value)
  return type(value) == 'string' and #value == 64 and string.match(value, '^[0-9a-f]+$') ~= nil
end
local function owner(value)
  return type(value) == 'string' and #value == 43 and string.match(value, '^[A-Za-z0-9_-]+$') ~= nil
end
local fingerprint, family, request, token = ARGV[1], ARGV[2], ARGV[3], ARGV[4]
local user_limit, global_limit, active_limit = integer(ARGV[5], 1, 1000000), integer(ARGV[6], 1, 1000000), integer(ARGV[7], 1, 128)
if #KEYS ~= 6 or #ARGV ~= 7 or not hex(fingerprint) or not hex(family) or not hex(request)
    or not owner(token) or not user_limit or not global_limit or not active_limit then return {9} end
local now_parts = redis.call('TIME')
local now = tonumber(now_parts[1]) * 1000 + math.floor(tonumber(now_parts[2]) / 1000)
local function typed_string(key, maximum_ttl)
  local kind = redis.call('TYPE', key).ok
  if kind == 'none' then return nil, -2, true end
  if kind ~= 'string' then return nil, 0, false end
  local ttl = redis.call('PTTL', key)
  if ttl <= 0 or ttl > maximum_ttl then return nil, ttl, false end
  return redis.call('GET', key), ttl, true
end
local config, config_ttl, valid = typed_string(KEYS[1], 120000)
if not valid or (config and not hex(config)) then return {9} end
local reservation, reservation_ttl
reservation, reservation_ttl, valid = typed_string(KEYS[2], 120000)
if not valid then return {9} end
local old_family, old_request, old_token
if reservation then
  old_family, old_request, old_token = string.match(reservation, '^([0-9a-f]+):([0-9a-f]+):([A-Za-z0-9_-]+)$')
  if not hex(old_family) or not hex(old_request) or not owner(old_token) then return {9} end
end
local user_rate, user_rate_ttl
user_rate, user_rate_ttl, valid = typed_string(KEYS[3], 60000)
if not valid then return {9} end
local user_count = 0
if user_rate then
  user_count = integer(user_rate, 1, user_limit)
  if not user_count then return {9} end
end
local global_rate, global_rate_ttl
global_rate, global_rate_ttl, valid = typed_string(KEYS[4], 60000)
if not valid then return {9} end
local global_count = 0
if global_rate then
  global_count = integer(global_rate, 1, global_limit)
  if not global_count then return {9} end
end
local user_owner, user_owner_ttl
user_owner, user_owner_ttl, valid = typed_string(KEYS[5], 60000)
if not valid or (user_owner and not owner(user_owner)) then return {9} end
local global_kind = redis.call('TYPE', KEYS[6]).ok
local global_ttl, active_count, earliest = -2, 0, 60000
if global_kind ~= 'none' then
  if global_kind ~= 'zset' then return {9} end
  global_ttl = redis.call('PTTL', KEYS[6])
  if global_ttl <= 0 or global_ttl > 60000 or redis.call('ZCARD', KEYS[6]) > 128 then return {9} end
  local members = redis.call('ZRANGE', KEYS[6], 0, -1, 'WITHSCORES')
  for index = 1, #members, 2 do
    local score = tonumber(members[index + 1])
    if not owner(members[index]) or not score or score ~= math.floor(score) or score < 0 or score > now + 60000 then return {9} end
    if score > now then
      active_count = active_count + 1
      earliest = math.min(earliest, score - now)
    end
  end
end
local function retry(milliseconds)
  return math.max(1, math.min(120, math.ceil(milliseconds / 1000)))
end
local expected = family .. ':' .. request .. ':' .. token
'''

_RESERVE = _COMMON + r'''
if config and config ~= fingerprint then return {9} end
if not config and (reservation or user_rate or global_rate or user_owner or global_kind ~= 'none') then return {9} end
if reservation then
  if old_family ~= family then return {3} end
  if old_request ~= request then return {4} end
  return {2, retry(reservation_ttl)}
end
local waiting = 0
if user_count >= user_limit then waiting = math.max(waiting, user_rate_ttl) end
if global_count >= global_limit then waiting = math.max(waiting, global_rate_ttl) end
if user_owner then waiting = math.max(waiting, user_owner_ttl) end
if active_count >= active_limit then waiting = math.max(waiting, earliest) end
if waiting > 0 then return {5, retry(waiting)} end
-- Every remaining command has known argument, key type and finite bounds.
redis.call('SET', KEYS[1], fingerprint, 'PX', 120000)
if user_rate then redis.call('INCR', KEYS[3]) else redis.call('SET', KEYS[3], 1, 'PX', 60000) end
if global_rate then redis.call('INCR', KEYS[4]) else redis.call('SET', KEYS[4], 1, 'PX', 60000) end
redis.call('SET', KEYS[5], token, 'PX', 60000)
redis.call('ZREMRANGEBYSCORE', KEYS[6], '-inf', now)
redis.call('ZADD', KEYS[6], now + 60000, token)
redis.call('PEXPIRE', KEYS[6], 60000)
redis.call('SET', KEYS[2], expected, 'PX', 120000)
return {1}
'''

_OWNED = _COMMON + r'''
if not config or config ~= fingerprint or reservation ~= expected or user_owner ~= token then return {0} end
local expiry = redis.call('ZSCORE', KEYS[6], token)
if not expiry or tonumber(expiry) <= now then return {0} end
return {1}
'''

_RELEASE = _COMMON + r'''
if not config or config ~= fingerprint or reservation ~= expected or user_owner ~= token then return {0} end
local expiry = redis.call('ZSCORE', KEYS[6], token)
if not expiry or tonumber(expiry) <= now then return {0} end
redis.call('DEL', KEYS[5])
redis.call('ZREM', KEYS[6], token)
if redis.call('ZCARD', KEYS[6]) == 0 then redis.call('DEL', KEYS[6]) end
-- Keep the reservation and minute counters: failure/cancel never refunds them.
return {1}
'''


@dataclass(frozen=True, repr=False)
class AdmissionLease:
    user_id: int
    idempotency_key: str
    family_hash: str
    request_hash: str
    owner: str = field(repr=False)
    keys: tuple[str, ...] = field(repr=False)
    fingerprint: str = field(repr=False)


def _unavailable():
    return LedgerError('AGENT_ADMISSION_UNAVAILABLE')


class RedisRunAdmission:
    def __init__(self, redis_client, *, namespace='agent:blog-qa:{sun-world}',
                 user_per_minute=6, global_per_minute=10, max_active=1):
        if (not callable(getattr(redis_client, 'eval', None)) or not isinstance(namespace, str)
                or len(namespace) > 128 or not re.fullmatch(r'[a-z0-9][a-z0-9:_-]*\{sun-world\}[a-z0-9:_-]*', namespace)
                or any(type(value) is not int or not 1 <= value <= MAX_LIMIT
                       for value in (user_per_minute, global_per_minute))
                or type(max_active) is not int or not 1 <= max_active <= 128):
            raise _unavailable()
        self._redis, self._namespace = redis_client, namespace
        self._user_limit, self._global_limit, self._max_active = user_per_minute, global_per_minute, max_active
        self._fingerprint = hashlib.sha256(json.dumps(
            dict(version=1, user=user_per_minute, global_rate=global_per_minute, active=max_active,
                 reservation_ttl=RESERVATION_TTL, slot_ttl=SLOT_TTL, rate_ttl=RATE_TTL),
            sort_keys=True, separators=(',', ':')).encode()).hexdigest()

    @staticmethod
    def _inputs(user_id, idempotency_key, family_hash, request_hash):
        if (type(user_id) is not int or not 1 <= user_id <= 9_223_372_036_854_775_807
                or not isinstance(idempotency_key, str) or len(idempotency_key) != 36
                or not all(isinstance(value, str) and re.fullmatch('[0-9a-f]{64}', value)
                           for value in (family_hash, request_hash))):
            raise _unavailable()
        try:
            if str(UUID(idempotency_key)) != idempotency_key:
                raise ValueError
        except (ValueError, TypeError, AttributeError):
            raise _unavailable() from None

    def _keys(self, user_id, key):
        # Namespace and user/key digests are computed only by trusted server code.
        identity = hashlib.sha256(f'{user_id}:{key}'.encode('ascii')).hexdigest()
        base = self._namespace
        return (base + ':config', base + ':request:' + identity, base + f':rate:user:{user_id}',
                base + ':rate:global', base + f':slot:user:{user_id}', base + ':slots:global')

    def _arguments(self, lease):
        return (self._fingerprint, lease.family_hash, lease.request_hash, lease.owner,
                self._user_limit, self._global_limit, self._max_active)

    def _eval(self, script, lease):
        try:
            result = self._redis.eval(script, 6, *lease.keys, *self._arguments(lease))
        except Exception:
            raise _unavailable() from None
        if (not isinstance(result, (tuple, list)) or not 1 <= len(result) <= 2
                or any(type(value) is not int for value in result)):
            raise _unavailable()
        return result

    def _lease(self, lease):
        try:
            if not isinstance(lease, AdmissionLease):
                return False
            self._inputs(lease.user_id, lease.idempotency_key, lease.family_hash, lease.request_hash)
            return (lease.keys == self._keys(lease.user_id, lease.idempotency_key)
                    and lease.fingerprint == self._fingerprint and isinstance(lease.owner, str)
                    and bool(re.fullmatch('[A-Za-z0-9_-]{43}', lease.owner)))
        except Exception:
            return False

    def reserve(self, *, user_id, idempotency_key, family_hash, request_hash):
        self._inputs(user_id, idempotency_key, family_hash, request_hash)
        lease = AdmissionLease(user_id, idempotency_key, family_hash, request_hash,
                               secrets.token_urlsafe(32), self._keys(user_id, idempotency_key), self._fingerprint)
        result = self._eval(_RESERVE, lease)
        if result == [1] or result == (1,):
            return lease
        code = {2: 'AGENT_ADMISSION_PENDING', 3: 'AGENT_RUN_NOT_FOUND',
                4: 'AGENT_IDEMPOTENCY_CONFLICT', 5: 'AGENT_RATE_LIMITED'}.get(result[0])
        if not code:
            raise _unavailable()
        error = LedgerError(code)
        if result[0] in (2, 5):
            if len(result) != 2 or not 1 <= result[1] <= 120:
                raise _unavailable()
            error.retry_after = result[1]
        elif len(result) != 1:
            raise _unavailable()
        raise error

    def owned(self, lease):
        if not self._lease(lease):
            return False
        result = self._eval(_OWNED, lease)
        if result in ([0], (0,)):
            return False
        if result in ([1], (1,)):
            return True
        raise _unavailable()

    def release(self, lease):
        if not self._lease(lease):
            return False
        result = self._eval(_RELEASE, lease)
        if result in ([0], (0,)):
            return False
        if result in ([1], (1,)):
            return True
        raise _unavailable()

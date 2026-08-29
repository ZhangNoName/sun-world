import os
import time
from typing import Any, Dict

from redis import Redis
from loguru import logger

SECONDS_IN_ONE_MINUTE = 60
SECONDS_IN_FIVE_MINUTES = 300
SECONDS_IN_TEN_MINUTES = 600
SECONDS_IN_ONE_HOUR = 3600
SECONDS_IN_ONE_DAY = 86400
SECONDS_IN_ONE_MONTH = 2592000


class RedisManager():
    """Redis 单点服务"""
    logger = logger

    def __init__(
        self,
        auth: str,
        ip: str,
        port: int,
        db:int,
        key_prefix: str,
        timeout: float | None = None,
        **kwargs
    ):
        """
        @param auth: 授权密码
        @param ip: Redis 服务器 IP
        @param port: Redis 服务器端口
        @param db: Redis 数据库编号
        @param key_prefix: 数据 key 前缀
        @param timeout: 超时时间，单位：秒
        """
        super().__init__()

        self.auth = auth
        self.key_prefix = key_prefix
        configured_timeout = (
            timeout
            if timeout is not None
            else float(os.getenv("REDIS_SOCKET_TIMEOUT_SECONDS", "2"))
        )
        if configured_timeout < 0.1 or configured_timeout > 30:
            raise ValueError(
                "REDIS_SOCKET_TIMEOUT_SECONDS must be between 0.1 and 30"
            )
        self.timeout = configured_timeout

        self.redis_node = {
            "host": ip,
            "port": port,
            "db": db
        }

        self.connect()
        self.ping()

    def __repr__(self) -> str:
        return "redis single node {}:{} db:{}".format(
            self.redis_node["host"], self.redis_node["port"], self.redis_node["db"]
        )

    def connect(self) -> bool:
        try:
            self.r = Redis(
                host=self.redis_node["host"],
                port=self.redis_node["port"],
                db=self.redis_node['db'],
                decode_responses=True,
                password=self.auth,
                socket_connect_timeout=self.timeout,
                socket_timeout=self.timeout,
                socket_keepalive=True,
                health_check_interval=30,
                retry_on_timeout=False,
            )
        except Exception as ex:
            self.r = None

            self.logger.error("failed to connect {}: {}".format(self, ex))
            return False
        else:
            self.logger.debug(" {} connected success".format(self))
            return True

    def _maybe_reconnect(self):
        if self.r is None and not self.connect():
            raise Exception()

    def ping(self) -> bool:
        """ping/探活"""
        try:
            self._maybe_reconnect()

            return self.r.ping()
        except:
            return False

    def _get_redis_key(self, name: str, prefix: str = None):
        """
        转换 redis key 修饰器
        @param name: key
        @param prefix: 自定义前缀
        """
        if prefix:  # 自定义前缀
            keyname = "{}:{}".format(prefix, name)
        elif self.key_prefix:
            keyname = "{}:{}".format(self.key_prefix, name)
        else:
            keyname = name

        return keyname

    def hset(
        self,
        name: str,
        key: str,
        value: Any,
        ttl: int = SECONDS_IN_ONE_MONTH,
        prefix: str = None,
    ) -> int:
        """
        redis hset
        @param name: name
        @param key: key
        @param value: value
        @param ttl: 失效时间，单位：秒
        @param prefix: 自定义前缀
        @return int
        """
        self._maybe_reconnect()
        redis_key = self._get_redis_key(name, prefix)

        rtn = self.r.hset(redis_key, key, value)
        if ttl is not None and ttl > 0:
            self.r.expire(redis_key, ttl)

        return rtn

    def hget(self, name: str, key: str, prefix: str = None) -> Any:
        """
        redis hget
        @param name: name
        @param key: key
        @param prefix: 自定义前缀
        @return value
        """
        self._maybe_reconnect()
        redis_key = self._get_redis_key(name, prefix)

        return self.r.hget(redis_key, key)

    def hgetall(self, name: str, prefix: str = None) -> Dict:
        """
        hget
        @param name: redis key
        @param prefix: 自定义前缀
        @return hash key/value 词典
        """
        self._maybe_reconnect()
        redis_key = self._get_redis_key(name, prefix)

        return self.r.hgetall(redis_key)

    def hdelete(self, name: str, key: str, prefix: str = None) -> int:
        """Delete one field from a Redis hash."""
        self._maybe_reconnect()
        redis_key = self._get_redis_key(name, prefix)

        return self.r.hdel(redis_key, key)

    def store_session_tokens(
        self,
        *,
        user_id: str,
        device_id: str,
        session_family_id: str,
        access_token: str,
        refresh_token: str,
        access_ttl: int,
        refresh_ttl: int,
    ) -> None:
        """Atomically create/replace one device session token family."""
        self._maybe_reconnect()
        keys = (
            self._get_redis_key(f"user:{user_id}:access_tokens"),
            self._get_redis_key(f"user:{user_id}:refresh_tokens"),
            self._get_redis_key(f"user:{user_id}:session_families"),
        )
        script = """
        redis.call('HSET', KEYS[1], ARGV[1], ARGV[3])
        redis.call('EXPIRE', KEYS[1], tonumber(ARGV[5]))
        redis.call('HSET', KEYS[2], ARGV[1], ARGV[4])
        redis.call('EXPIRE', KEYS[2], tonumber(ARGV[6]))
        redis.call('HSET', KEYS[3], ARGV[1], ARGV[2])
        redis.call('EXPIRE', KEYS[3], tonumber(ARGV[6]))
        return 1
        """
        self.r.eval(
            script,
            len(keys),
            *keys,
            device_id,
            session_family_id,
            access_token,
            refresh_token,
            max(1, int(access_ttl)),
            max(1, int(refresh_ttl)),
        )

    def get_session_token_snapshot(
        self,
        *,
        user_id: str,
        device_id: str,
    ) -> tuple[str, str, str] | None:
        """Atomically read one device's access, refresh and family values."""
        self._maybe_reconnect()
        keys = (
            self._get_redis_key(f"user:{user_id}:access_tokens"),
            self._get_redis_key(f"user:{user_id}:refresh_tokens"),
            self._get_redis_key(f"user:{user_id}:session_families"),
        )
        script = """
        local access = redis.call('HGET', KEYS[1], ARGV[1])
        local refresh = redis.call('HGET', KEYS[2], ARGV[1])
        local family = redis.call('HGET', KEYS[3], ARGV[1])
        return {access, refresh, family}
        """
        snapshot = self.r.eval(
            script,
            len(keys),
            *keys,
            device_id,
        )
        if not isinstance(snapshot, (list, tuple)) or len(snapshot) != 3:
            return None
        access_token, refresh_token, session_family_id = snapshot
        if not all(
            isinstance(value, str) and value
            for value in (access_token, refresh_token, session_family_id)
        ):
            return None
        return access_token, refresh_token, session_family_id

    def rotate_session_tokens(
        self,
        *,
        user_id: str,
        device_id: str,
        expected_refresh_token: str,
        new_access_token: str,
        new_refresh_token: str,
        access_ttl: int,
        refresh_ttl: int,
        used_refresh_key: str,
        session_family_id: str,
        revoked_session_key: str,
        reuse_grace_seconds: int = 0,
    ) -> int:
        """Atomically rotate one device session.

        Return values are intentionally explicit:
        1 = rotated, 0 = unknown/stale token, 2 = replay detected and the
        matching token family revoked, 3 = a duplicate inside the bounded
        concurrency grace window, 4 = the family was already revoked.
        The token itself is represented by a SHA-256 key supplied by the
        caller, and its marker is bound to the session family ID.
        """
        self._maybe_reconnect()
        access_key = self._get_redis_key(f"user:{user_id}:access_tokens")
        refresh_key = self._get_redis_key(f"user:{user_id}:refresh_tokens")
        replay_key = self._get_redis_key(used_refresh_key)
        family_key = self._get_redis_key(f"user:{user_id}:session_families")
        revoked_key = self._get_redis_key(revoked_session_key)
        script = """
        if redis.call('EXISTS', KEYS[5]) == 1 then
            return 4
        end
        local current = redis.call('HGET', KEYS[2], ARGV[1])
        local family = redis.call('HGET', KEYS[4], ARGV[1])
        if not family and current == ARGV[2] then
            redis.call('HSET', KEYS[4], ARGV[1], ARGV[7])
            redis.call('EXPIRE', KEYS[4], tonumber(ARGV[6]))
            family = ARGV[7]
        end
        if family ~= ARGV[7] then
            return 0
        end
        if current ~= ARGV[2] then
            local marker = redis.call('GET', KEYS[3])
            if not marker then
                return 0
            end
            local separator = string.find(marker, '|', 1, true)
            local used_family = marker
            local used_at_ms = nil
            if separator then
                used_family = string.sub(marker, 1, separator - 1)
                used_at_ms = tonumber(string.sub(marker, separator + 1))
            end
            if used_family ~= ARGV[7] then
                return 0
            end
            local grace_ms = tonumber(ARGV[8])
            if used_at_ms and grace_ms > 0 then
                local redis_time = redis.call('TIME')
                local now_ms = tonumber(redis_time[1]) * 1000 + math.floor(tonumber(redis_time[2]) / 1000)
                if now_ms - used_at_ms <= grace_ms then
                    return 3
                end
            end
            redis.call('HDEL', KEYS[1], ARGV[1])
            redis.call('HDEL', KEYS[2], ARGV[1])
            redis.call('HDEL', KEYS[4], ARGV[1])
            redis.call('SET', KEYS[5], '1', 'EX', tonumber(ARGV[6]))
            return 2
        end
        redis.call('HSET', KEYS[1], ARGV[1], ARGV[3])
        redis.call('EXPIRE', KEYS[1], tonumber(ARGV[5]))
        redis.call('HSET', KEYS[2], ARGV[1], ARGV[4])
        redis.call('EXPIRE', KEYS[2], tonumber(ARGV[6]))
        redis.call('EXPIRE', KEYS[4], tonumber(ARGV[6]))
        local redis_time = redis.call('TIME')
        local used_at_ms = tonumber(redis_time[1]) * 1000 + math.floor(tonumber(redis_time[2]) / 1000)
        redis.call('SET', KEYS[3], ARGV[7] .. '|' .. tostring(used_at_ms), 'EX', tonumber(ARGV[6]))
        return 1
        """
        return int(
            self.r.eval(
                script,
                5,
                access_key,
                refresh_key,
                replay_key,
                family_key,
                revoked_key,
                device_id,
                expected_refresh_token,
                new_access_token,
                new_refresh_token,
                max(1, int(access_ttl)),
                max(1, int(refresh_ttl)),
                session_family_id,
                max(0, int(reuse_grace_seconds)) * 1000,
            )
        )

    def revoke_session_tokens(
        self,
        *,
        user_id: str,
        device_id: str,
        session_family_id: str,
        candidate_token: str,
        revoked_session_key: str,
        session_ttl: int,
        all_devices: bool = False,
    ) -> int:
        """Atomically tombstone and revoke one token family or every device."""
        self._maybe_reconnect()
        keys = (
            self._get_redis_key(f"user:{user_id}:access_tokens"),
            self._get_redis_key(f"user:{user_id}:refresh_tokens"),
            self._get_redis_key(f"user:{user_id}:session_families"),
            self._get_redis_key(revoked_session_key),
        )
        script = """
        if ARGV[5] == '1' then
            local families = redis.call('HVALS', KEYS[3])
            for _, family in ipairs(families) do
                redis.call('SET', ARGV[6] .. family, '1', 'EX', tonumber(ARGV[4]))
            end
            redis.call('SET', KEYS[4], '1', 'EX', tonumber(ARGV[4]))
            redis.call('DEL', KEYS[1], KEYS[2], KEYS[3])
            return 1
        end

        local family = redis.call('HGET', KEYS[3], ARGV[1])
        if family and family ~= ARGV[2] then
            return 0
        end
        if not family then
            local access = redis.call('HGET', KEYS[1], ARGV[1])
            local refresh = redis.call('HGET', KEYS[2], ARGV[1])
            if access ~= ARGV[3] and refresh ~= ARGV[3] then
                if redis.call('EXISTS', KEYS[4]) == 1 then
                    return 1
                end
                return 0
            end
        end
        redis.call('SET', KEYS[4], '1', 'EX', tonumber(ARGV[4]))
        redis.call('HDEL', KEYS[1], ARGV[1])
        redis.call('HDEL', KEYS[2], ARGV[1])
        redis.call('HDEL', KEYS[3], ARGV[1])
        return 1
        """
        return int(
            self.r.eval(
                script,
                len(keys),
                *keys,
                device_id,
                session_family_id,
                candidate_token,
                max(1, int(session_ttl)),
                "1" if all_devices else "0",
                self._get_redis_key("auth:revoked_session:"),
            )
        )

    def get(self, name: str, prefix: str = None) -> Any:
        """Read a string value."""
        self._maybe_reconnect()
        redis_key = self._get_redis_key(name, prefix)

        return self.r.get(redis_key)

    def setex(
        self,
        name: str,
        ttl: int,
        value: Any,
        prefix: str = None,
    ) -> bool:
        """Store a string value with an expiry in seconds."""
        self._maybe_reconnect()
        redis_key = self._get_redis_key(name, prefix)

        return bool(self.r.setex(redis_key, ttl, value))

    def set_if_absent(
        self,
        name: str,
        value: Any,
        ttl: int,
        prefix: str = None,
    ) -> bool:
        """Set a value with a TTL only when the key does not already exist."""
        self._maybe_reconnect()
        redis_key = self._get_redis_key(name, prefix)

        return bool(self.r.set(redis_key, value, ex=ttl, nx=True))

    def consume_fixed_window(
        self,
        *,
        name: str,
        limit: int,
        window_seconds: int,
        prefix: str = None,
    ) -> tuple[bool, int, int]:
        """Atomically consume one request from a fixed-window rate limit."""
        self._maybe_reconnect()
        redis_key = self._get_redis_key(name, prefix)
        script = """
        local count = redis.call('INCR', KEYS[1])
        if count == 1 then
            redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))
        end
        local ttl = redis.call('TTL', KEYS[1])
        return {count, ttl}
        """
        count, ttl = self.r.eval(
            script,
            1,
            redis_key,
            max(1, int(limit)),
            max(1, int(window_seconds)),
        )
        normalized_limit = max(1, int(limit))
        return (
            int(count) <= normalized_limit,
            max(0, normalized_limit - int(count)),
            max(1, int(ttl)),
        )

    def consume_multi_fixed_window(
        self,
        limits: list[tuple[str, int, int]],
        *,
        prefix: str = None,
    ) -> tuple[bool, int]:
        """Atomically consume multiple fixed-window budgets or none of them."""
        if not limits:
            raise ValueError("At least one rate limit is required")
        self._maybe_reconnect()
        keys = [self._get_redis_key(name, prefix) for name, _limit, _window in limits]
        arguments: list[int] = []
        for _name, limit, window in limits:
            arguments.extend((max(1, int(limit)), max(1, int(window))))
        script = """
        local retry_after = 1
        for index = 1, #KEYS do
            local offset = (index - 1) * 2
            local limit = tonumber(ARGV[offset + 1])
            local window = tonumber(ARGV[offset + 2])
            local count = tonumber(redis.call('GET', KEYS[index]) or '0')
            local ttl = redis.call('TTL', KEYS[index])
            if count > 0 and ttl < 1 then
                redis.call('EXPIRE', KEYS[index], window)
                ttl = window
            end
            if count >= limit then
                return {0, math.max(1, ttl)}
            end
        end
        for index = 1, #KEYS do
            local offset = (index - 1) * 2
            local window = tonumber(ARGV[offset + 2])
            local count = redis.call('INCR', KEYS[index])
            if count == 1 then
                redis.call('EXPIRE', KEYS[index], window)
            end
            retry_after = math.max(retry_after, redis.call('TTL', KEYS[index]))
        end
        return {1, retry_after}
        """
        allowed, retry_after = self.r.eval(
            script,
            len(keys),
            *keys,
            *arguments,
        )
        return bool(int(allowed)), max(1, int(retry_after))

    def reserve_rate_limits_with_cooldowns(
        self,
        *,
        reservation_name: str,
        reservation_id: str,
        cooldowns: list[tuple[str, int]],
        limits: list[tuple[str, int, int]],
        reservation_ttl: int,
        prefix: str = None,
    ) -> tuple[bool, int]:
        """Atomically reserve cooldowns and counters for one delivery attempt."""
        if not cooldowns or not limits:
            raise ValueError("Cooldowns and rate limits are required")
        self._maybe_reconnect()
        keys = [self._get_redis_key(reservation_name, prefix)]
        keys.extend(self._get_redis_key(name, prefix) for name, _ttl in cooldowns)
        keys.extend(
            self._get_redis_key(name, prefix) for name, _limit, _window in limits
        )
        arguments: list[Any] = [
            reservation_id,
            max(1, int(reservation_ttl)),
            len(cooldowns),
            len(limits),
        ]
        arguments.extend(max(1, int(ttl)) for _name, ttl in cooldowns)
        for _name, limit, window in limits:
            arguments.extend((max(1, int(limit)), max(1, int(window))))
        script = """
        local cooldown_count = tonumber(ARGV[3])
        local limit_count = tonumber(ARGV[4])
        if redis.call('EXISTS', KEYS[1]) == 1 then
            return {0, math.max(1, redis.call('TTL', KEYS[1]))}
        end
        for index = 1, cooldown_count do
            local key_index = 1 + index
            if redis.call('EXISTS', KEYS[key_index]) == 1 then
                return {0, math.max(1, redis.call('TTL', KEYS[key_index]))}
            end
        end
        for index = 1, limit_count do
            local key_index = 1 + cooldown_count + index
            local argument_index = 5 + cooldown_count + ((index - 1) * 2)
            local limit = tonumber(ARGV[argument_index])
            local window = tonumber(ARGV[argument_index + 1])
            local count = tonumber(redis.call('GET', KEYS[key_index]) or '0')
            local ttl = redis.call('TTL', KEYS[key_index])
            if count > 0 and ttl < 1 then
                redis.call('EXPIRE', KEYS[key_index], window)
                ttl = window
            end
            if count >= limit then
                return {0, math.max(1, ttl)}
            end
        end
        redis.call('SET', KEYS[1], ARGV[1], 'EX', tonumber(ARGV[2]))
        local retry_after = 1
        for index = 1, cooldown_count do
            local ttl = tonumber(ARGV[4 + index])
            redis.call('SET', KEYS[1 + index], ARGV[1], 'EX', ttl)
            retry_after = math.max(retry_after, ttl)
        end
        for index = 1, limit_count do
            local key_index = 1 + cooldown_count + index
            local argument_index = 5 + cooldown_count + ((index - 1) * 2)
            local window = tonumber(ARGV[argument_index + 1])
            local count = redis.call('INCR', KEYS[key_index])
            if count == 1 then
                redis.call('EXPIRE', KEYS[key_index], window)
            end
        end
        return {1, retry_after}
        """
        allowed, retry_after = self.r.eval(
            script,
            len(keys),
            *keys,
            *arguments,
        )
        return bool(int(allowed)), max(1, int(retry_after))

    def rollback_rate_limit_reservation(
        self,
        *,
        reservation_name: str,
        reservation_id: str,
        cooldown_names: list[str],
        limit_names: list[str],
        prefix: str = None,
    ) -> bool:
        """Roll back one owned delivery reservation exactly once."""
        self._maybe_reconnect()
        keys = [self._get_redis_key(reservation_name, prefix)]
        keys.extend(self._get_redis_key(name, prefix) for name in cooldown_names)
        keys.extend(self._get_redis_key(name, prefix) for name in limit_names)
        script = """
        local cooldown_count = tonumber(ARGV[2])
        local limit_count = tonumber(ARGV[3])
        if redis.call('GET', KEYS[1]) ~= ARGV[1] then
            return 0
        end
        for index = 1, cooldown_count do
            local key_index = 1 + index
            if redis.call('GET', KEYS[key_index]) == ARGV[1] then
                redis.call('DEL', KEYS[key_index])
            end
        end
        for index = 1, limit_count do
            local key_index = 1 + cooldown_count + index
            local count = tonumber(redis.call('GET', KEYS[key_index]) or '0')
            if count <= 1 then
                redis.call('DEL', KEYS[key_index])
            else
                redis.call('DECR', KEYS[key_index])
            end
        end
        redis.call('DEL', KEYS[1])
        return 1
        """
        return bool(
            self.r.eval(
                script,
                len(keys),
                *keys,
                reservation_id,
                len(cooldown_names),
                len(limit_names),
            )
        )

    def commit_rate_limit_reservation(
        self,
        *,
        reservation_name: str,
        reservation_id: str,
        prefix: str = None,
    ) -> bool:
        """Discard rollback ownership after a delivery succeeds."""
        self._maybe_reconnect()
        redis_key = self._get_redis_key(reservation_name, prefix)
        script = """
        if redis.call('GET', KEYS[1]) ~= ARGV[1] then
            return 0
        end
        return redis.call('DEL', KEYS[1])
        """
        return bool(self.r.eval(script, 1, redis_key, reservation_id))

    def acquire_bounded_lease(
        self,
        *,
        name: str,
        member: str,
        limit: int,
        ttl: int,
        prefix: str = None,
    ) -> bool:
        """Acquire one expiring concurrency slot from a Redis sorted set."""
        self._maybe_reconnect()
        redis_key = self._get_redis_key(name, prefix)
        now_ms = int(time.time() * 1000)
        ttl_ms = max(1, int(ttl)) * 1000
        script = """
        redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
        if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[3]) then
            return 0
        end
        redis.call('ZADD', KEYS[1], ARGV[1] + ARGV[2], ARGV[4])
        redis.call('EXPIRE', KEYS[1], math.ceil(tonumber(ARGV[2]) / 1000))
        return 1
        """
        return bool(
            self.r.eval(
                script,
                1,
                redis_key,
                now_ms,
                ttl_ms,
                max(1, int(limit)),
                member,
            )
        )

    def release_bounded_lease(
        self,
        *,
        name: str,
        member: str,
        prefix: str = None,
    ) -> int:
        self._maybe_reconnect()
        redis_key = self._get_redis_key(name, prefix)
        return int(self.r.zrem(redis_key, member))

    def getdel(self, name: str, prefix: str = None) -> Any:
        """Atomically read and delete a string value.

        Redis 6.2 introduced GETDEL. Keeping this operation in the manager makes
        one-time OAuth and verification-code state consumption explicit.
        """
        self._maybe_reconnect()
        redis_key = self._get_redis_key(name, prefix)

        return self.r.getdel(redis_key)

    def expire(self, name: str, ttl: int, prefix: str = None) -> bool:
        """
        set expire time
        @param name: redis key
        @param ttl: timeout
        @param prefix: 自定义前缀
        """
        self._maybe_reconnect()
        redis_key = self._get_redis_key(name, prefix)

        return self.r.expire(redis_key, ttl)

    def hincrby(self, name: str, key: str, value: int, prefix: str = None) -> int:
        """
        hincrby
        @param name: redis key
        @param key
        @param value
        @param prefix: 自定义前缀
        @return int
        """
        self._maybe_reconnect()
        redis_key = self._get_redis_key(name, prefix)

        return self.r.hincrby(redis_key, key, value)

    def delete(self, name: str, prefix: str = None):
        """
        delete key
        @param name: redis key
        @param prefix: 自定义前缀
        @return 0/1
        """
        self._maybe_reconnect()
        redis_key = self._get_redis_key(name, prefix)

        return self.r.delete(redis_key)

    def zrange(self, name: str, prefix: str = None):
        """
        zsetget key
        @param name: redis key
        @param prefix: 自定义前缀
        @return value
        """
        self._maybe_reconnect()
        redis_key = self._get_redis_key(name, prefix)

        return self.r.zrange(redis_key, 0, -1, withscores=True)

    def lrange(self, name: str, prefix: str = None):
        """
        redis lrange key
        @param name: redis key
        @param prefix: 自定义前缀
        @return value
        """
        self._maybe_reconnect()
        redis_key = self._get_redis_key(name, prefix)
        return self.r.lrange(redis_key, 0, -1)

    def lpush(
        self, name: str, value: Any, prefix: str = None, ttl=SECONDS_IN_ONE_MONTH
    ):
        """
        redis lpush
        @param name: redis key
        @param value
        @param prefix: 自定义前缀
        @return int
        """
        self._maybe_reconnect()
        redis_key = self._get_redis_key(name, prefix)
        rtn = self.r.lpush(redis_key, value)
        if ttl is not None and ttl > 0:
            self.r.expire(redis_key, ttl)
        return rtn

    def lrem(self, name: str, value: Any, prefix: str = None):
        """
        redis lrem
        @param name: redis key
        @param value
        @param prefix: 自定义前缀
        @return int
        """
        self._maybe_reconnect()
        redis_key = self._get_redis_key(name, prefix)
        return self.r.lrem(redis_key, 0, value)

    def scan(self,pattern:str,max_count=100):
        """
        redis scan
        @param pattern: redis pattern
        @param max_count: 最大数目
        @return int
        """
        cursor = '0'
        self._maybe_reconnect()
        res = {}
        while cursor != 0:
            cursor, keys =self.r.scan(cursor, match=pattern, count=max_count)
            for key in keys:
                key_type = self.r.type(key)
                if key_type == 'string':
                    value = self.r.get(key)
                elif key_type == 'hash':
                    value = self.r.hgetall(key)
                res[key] = value
        return res
    def exist(self, name: str, prefix: str = None) -> bool:
        """
        判断指定 key 是否存在
        @param name: redis key
        @param prefix: 自定义前缀
        @return bool
        """
        self._maybe_reconnect()
        redis_key = self._get_redis_key(name, prefix)
        return self.r.exists(redis_key) > 0

"""Fixed lifetime run capacity; uses only the caller's existing transaction."""

from src.core import error_codes


_CAPACITY = 8192
_FIELDS = 'id,format_version,capacity,used_count,initialized'


def _fail(code):
    # Ledger imports this helper; defer the exception import to avoid a cycle.
    from .ledger import LedgerError
    raise LedgerError(code)


class LedgerCapacity:
    """No configurable limits, connection creation, commit, retry or refund."""

    @staticmethod
    def _used(uow, *, lock):
        rows = uow.fetch_all('SELECT ' + _FIELDS + ' FROM agent_ledger_capacity LIMIT 2'
                             + (' FOR UPDATE' if lock else ''))
        if not rows:
            row = None
        elif len(rows) == 1:
            row = rows[0]
            if (any(type(row.get(key)) is not int for key in _FIELDS.split(','))
                    or row['id'] != 1 or row['format_version'] != 1 or row['capacity'] != _CAPACITY
                    or not 0 <= row['used_count'] <= 2**31 - 1
                    or row['initialized'] not in (0, 1)
                    or (row['initialized'] == 0 and row['used_count'] != 0)):
                _fail(error_codes.AGENT_LEDGER_CAPACITY_INVALID)
        else:
            _fail(error_codes.AGENT_LEDGER_CAPACITY_INVALID)
        if row is None or row['initialized'] == 0:
            # No content, aggregate count, deletion/profile filter or run locks.
            # 8193 is sufficient to reject even an arbitrarily large old DB.
            return len(uow.fetch_all('SELECT id FROM agent_runs LIMIT 8193'))
        return row['used_count']

    @staticmethod
    def _available(used):
        if used >= _CAPACITY:
            _fail(error_codes.AGENT_LEDGER_FULL)

    def check(self, uow):
        self._available(self._used(uow, lock=False))

    def reserve(self, uow):
        # Unlike INSERT IGNORE, duplicate initialization acquires an X lock
        # directly, before any history writes or run insertion.
        uow.execute('INSERT INTO agent_ledger_capacity (' + _FIELDS + ') VALUES (%s,%s,%s,%s,%s) '
                    'ON DUPLICATE KEY UPDATE id=id', (1, 1, _CAPACITY, 0, 0))
        used = self._used(uow, lock=True)
        self._available(used)
        changed = uow.execute('UPDATE agent_ledger_capacity SET used_count=%s,initialized=1 WHERE id=%s',
                              (used + 1, 1))
        if changed != 1:
            _fail(error_codes.AGENT_LEDGER_CAPACITY_INVALID)

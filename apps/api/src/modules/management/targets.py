"""Server-copied references checked only after current write authorization."""

from dataclasses import dataclass

from .policy import ManagementInputInvalid, ManagementReferenceNotFound


@dataclass(frozen=True)
class BindingReferences:
    role_id: int
    resource_ids: tuple[int, ...]

    def __post_init__(self):
        if (type(self.role_id) is not int or not 0 < self.role_id <= 9_223_372_036_854_775_807
                or type(self.resource_ids) is not tuple or len(self.resource_ids) > 500
                or any(type(value) is not int or not 0 < value <= 2_147_483_647
                       for value in self.resource_ids)
                or len(set(self.resource_ids)) != len(self.resource_ids)):
            raise ManagementInputInvalid()

    def require_existing(self, uow):
        role = uow.fetch_one('SELECT id FROM roles WHERE id = %s FOR UPDATE', (self.role_id,))
        if not role or role['id'] != self.role_id:
            raise ManagementReferenceNotFound()
        if not self.resource_ids:
            return
        ordered = tuple(sorted(self.resource_ids))
        placeholders = ','.join(['%s'] * len(ordered))
        resources = uow.fetch_all(
            f'SELECT id FROM resources FORCE INDEX (PRIMARY) WHERE id IN ({placeholders}) ORDER BY id FOR UPDATE',
            ordered,
        )
        if len(resources) != len(ordered) or {row['id'] for row in resources} != set(ordered):
            raise ManagementReferenceNotFound()

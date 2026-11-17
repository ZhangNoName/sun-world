"""Current admin mapping for the nine reviewed management capabilities."""

from dataclasses import dataclass
import math
from types import MappingProxyType

from src.core.auth import AuthorizationDenied, AuthorizationUnavailable, Principal
from src.core.auth.admin_audit import ADMIN_AUDIT_ACTIONS


CAPABILITIES = MappingProxyType({action: 'identity.' + action for action in sorted(ADMIN_AUDIT_ACTIONS)})


@dataclass(frozen=True)
class ManagementScope:
    app_id: str
    resource_type: str


class ManagementDenied(AuthorizationDenied):
    code = 'AUTH_FORBIDDEN'
    message = '当前账号无权执行此管理操作。'
    status_code = 403

    def __init__(self):
        super().__init__(self.message)


class ManagementLoginRequired(ManagementDenied):
    code = 'AUTH_UNAUTHORIZED'
    message = '请先登录后执行管理操作。'
    status_code = 401


class ManagementStepUpRequired(ManagementDenied):
    code = 'AUTH_STEP_UP_REQUIRED'
    message = '此安全操作需要近期登录，请退出后重新登录再试。'


class ManagementUnavailable(AuthorizationUnavailable):
    code = 'AUTH_SERVICE_UNAVAILABLE'
    message = '管理授权服务暂不可用，请稍后再试。'
    status_code = 503

    def __init__(self):
        super().__init__(self.message)


class ManagementInputInvalid(ManagementDenied):
    code = 'AUTH_MANAGEMENT_INPUT_INVALID'
    message = '管理操作参数格式无效。'
    status_code = 422


class ManagementReferenceNotFound(ManagementDenied):
    code = 'MANAGEMENT_REFERENCE_NOT_FOUND'
    message = '管理操作引用不存在。'
    status_code = 404


class ManagementPolicy:
    def require_scope(self, action, scope, target_id):
        if (type(action) is not str or action not in CAPABILITIES
                or type(scope) is not ManagementScope or type(scope.app_id) is not str
                or type(scope.resource_type) is not str or scope.app_id != 'sun-world'
                or scope.resource_type != action.split('.')[0]):
            raise ManagementDenied()
        if action.endswith('.create'):
            if target_id is not None:
                raise ManagementDenied()
        elif type(target_id) is not int or not 0 < target_id <= 9_223_372_036_854_775_807:
            raise ManagementDenied()

    def require(self, principal, action, scope, target_id, *, now, max_age):
        self.require_scope(action, scope, target_id)
        if type(principal) is not Principal or principal.kind != 'user':
            raise ManagementLoginRequired()
        if 'admin' not in principal.roles:
            raise ManagementDenied()
        if (type(now) not in (int, float) or not math.isfinite(now)
                or type(max_age) is not int or not 60 <= max_age <= 3600):
            raise ManagementUnavailable()
        if (type(principal.user_id) is not int or principal.user_id <= 0
                or type(principal.session_family) is not str or not principal.session_family.strip()
                or len(principal.session_family) > 128):
            raise ManagementLoginRequired()
        authenticated = principal.authenticated_at
        if (type(authenticated) is not int or authenticated <= 0
                or authenticated > int(now) + 60 or int(now) - authenticated > max_age):
            raise ManagementStepUpRequired()

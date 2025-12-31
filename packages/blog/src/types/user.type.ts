/**
 * 用户角色信息
 */
export interface UserRole {
  id: number
  name: string
  code: string
}

/**
 * 用户资源信息 (根据 JSON 暂定为 any 数组，可根据后续业务修改)
 */
export interface UserResource {
  // 根据实际业务需求补充字段
  [key: string]: any
}

/**
 * 用户信息主接口
 */
export interface UserInfo {
  id: number
  name: string
  age: number
  phone: string
  email: string
  /** 密码哈希值 */
  password: string
  /** 生日，格式: YYYY-MM-DD */
  birth_day: string
  /** 创建时间，格式: ISO 8601 */
  create_time: string
  /** 状态: 1-启用, 0-禁用 (根据实际业务定义) */
  status: number
  /** 性别: 0-未知/保密, 1-男, 2-女 (根据实际业务定义) */
  sex: number
  /** 用户所属角色列表 */
  roles: UserRole[]
  /** 用户拥有的资源权限 */
  resources: UserResource[]
}

import { RESOURCE_PERMISSIONS, UNLISTED_RESOURCES_ARE_OPEN, type Action } from "@/generated/permissions";
import { useSession } from "@/stores/session";

export function hasAnyRole(granted: string[] | undefined, roles: string[]): boolean {
  if (!granted || granted.length === 0) return false;
  return granted.some((role) => roles.includes(role));
}

/** 按钮级判定。未列出的资源默认放行（服务端仍是事实来源）；列出的资源按 actions 收紧。 */
export function can(resourceKey: string, action: Action): boolean {
  const grant = RESOURCE_PERMISSIONS[resourceKey];
  if (!grant) return UNLISTED_RESOURCES_ARE_OPEN;
  return hasAnyRole(grant[action], useSession().roles);
}

export function allowedActions(resourceKey: string): Action[] {
  const actions: Action[] = ["create", "read", "update", "delete"];
  return actions.filter((action) => can(resourceKey, action));
}

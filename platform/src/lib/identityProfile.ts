import type { SessionProfile } from "@/lib/session";
import type { IdentityUser } from "@/types/identity";

export function profileFromUser(user: IdentityUser): SessionProfile {
  const keys = user.role_keys?.length
    ? user.role_keys
    : (user.roles ?? []).map((role) => role.role_key);
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name || user.username,
    deptId: user.dept_id ?? null,
    deptName: user.dept_name ?? null,
    positionName: user.position_name ?? null,
    roleKeys: [...new Set(keys)]
  };
}

export function safeStudioRedirect(value: unknown, fallback = "/"): string {
  if (typeof value !== "string") return fallback;
  const target = value.trim();
  if (
    !target.startsWith("/") ||
    target.startsWith("//") ||
    target.includes(String.fromCharCode(92)) ||
    target.length > 2048
  ) {
    return fallback;
  }
  return target;
}

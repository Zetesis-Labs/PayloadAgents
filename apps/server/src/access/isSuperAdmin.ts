import type { Access, TypedUser } from "payload";

export const isSuperAdminAccess: Access = ({ req }): boolean => {
  return isSuperAdmin(req.user);
};

export const isSuperAdmin = (user: TypedUser | null): boolean => {
  if(user?.collection === "payload-mcp-api-keys") return false
  return Boolean(user?.roles?.includes("superadmin"));
};

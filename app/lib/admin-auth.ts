import { env } from "cloudflare:workers";
import { requireChatGPTUser, type ChatGPTUser } from "../chatgpt-auth";

function adminUserIds() {
  return new Set(
    (env.ADMIN_USER_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

export async function getAdminAccess(returnTo: string): Promise<{
  allowed: boolean;
  configured: boolean;
  user: ChatGPTUser;
}> {
  const user = await requireChatGPTUser(returnTo);
  const allowedIds = adminUserIds();
  return {
    allowed: allowedIds.has(user.userId),
    configured: allowedIds.size > 0,
    user,
  };
}

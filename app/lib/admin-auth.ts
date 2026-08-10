import { env } from "cloudflare:workers";
import { getChatGPTUser, requireChatGPTUser, type ChatGPTUser } from "../chatgpt-auth";

function commaSeparatedSet(value: string | undefined, normalize = (entry: string) => entry) {
  return new Set(
    (value ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .map(normalize),
  );
}

export async function getAdminAccess(returnTo: string): Promise<{
  allowed: boolean;
  configured: boolean;
  user: ChatGPTUser;
}> {
  const user = await requireChatGPTUser(returnTo);
  return adminAccessForUser(user);
}

export async function getAuthenticatedAdminAccess(): Promise<{
  allowed: boolean;
  configured: boolean;
  user: ChatGPTUser;
} | null> {
  const user = await getChatGPTUser();
  return user ? adminAccessForUser(user) : null;
}

function adminAccessForUser(user: ChatGPTUser) {
  const allowedIds = commaSeparatedSet(env.ADMIN_USER_IDS);
  const allowedEmails = commaSeparatedSet(env.ADMIN_EMAILS, (email) => email.toLowerCase());
  return {
    allowed: allowedIds.has(user.userId) || allowedEmails.has(user.email.toLowerCase()),
    configured: allowedIds.size > 0 || allowedEmails.size > 0,
    user,
  };
}

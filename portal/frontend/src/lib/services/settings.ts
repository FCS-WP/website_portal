import api from "@/lib/api";

export const settingsService = {
  get: () => api.get("/settings"),
  update: (data: Record<string, string | number | null>) =>
    api.put("/settings", data),
  testTelegram: (chatId?: string) =>
    api.post("/settings/telegram/test", chatId ? { chat_id: chatId } : {}),
};

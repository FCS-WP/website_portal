import api from "@/lib/api";

export const authService = {
  login: (email: string, password: string) =>
    api.post("/auth/login", { email, password }),
  logout: () => api.post("/auth/logout"),
  me: () => api.get("/auth/me"),
  updateProfile: (data: { name?: string; telegram_chat_id?: string }) =>
    api.put("/auth/profile", data),
  changePassword: (data: {
    current_password: string;
    password: string;
    password_confirmation: string;
  }) => api.put("/auth/password", data),
};

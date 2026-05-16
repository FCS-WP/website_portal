import api from "@/lib/api";

export const vaultPinService = {
  setup: (pin: string, pin_confirmation: string) =>
    api.post("/auth/vault-pin/setup", { pin, pin_confirmation }),

  change: (current_pin: string, new_pin: string, new_pin_confirmation: string) =>
    api.post("/auth/vault-pin/change", { current_pin, new_pin, new_pin_confirmation }),

  verify: (pin: string) =>
    api.post<{ data: { verified: boolean } }>("/auth/vault-pin/verify", { pin }),
};

export interface User {
  id: number;
  name: string;
  email: string;
  role: "admin" | "dev" | "mkt";
  telegram_chat_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Hosting {
  id: number;
  name: string;
  provider: string;
  note: string | null;
  sites_count?: number;
  created_at: string;
  updated_at: string;
}

export interface Site {
  id: number;
  hosting_id: number | null;
  name: string;
  url: string;
  description: string | null;
  status: "pending" | "connected" | "disconnected";
  wp_version: string | null;
  php_version: string | null;
  woo_active: boolean;
  last_ping_at: string | null;
  tags: string[] | null;
  hosting?: Hosting;
  users?: User[];
  created_at: string;
  updated_at: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: {
    pagination?: {
      total: number;
      per_page: number;
      current_page: number;
      last_page: number;
    };
  };
}

export interface ApiError {
  success: boolean;
  message: string;
  errors?: Record<string, string[]>;
}

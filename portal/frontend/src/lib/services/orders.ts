import api from "@/lib/api";

export interface OrdersListParams {
  site_id?: number;
  status?: string;
  payment?: string;
  from?: string;
  to?: string;
  page?: number;
  per_page?: number;
}

export const ordersService = {
  list: (params: OrdersListParams = {}) =>
    api.get("/orders", { params }),

  show: (id: number) => api.get(`/orders/${id}`),

  search: (orderId: string, siteId?: number) =>
    api.get("/orders/search", {
      params: { order_id: orderId, ...(siteId ? { site_id: siteId } : {}) },
    }),

  filterOptions: () => api.get("/orders/filter-options"),
  mostActive: (limit = 10) => api.get("/orders/most-active", { params: { limit } }),

  siteList: (siteId: number, params: Omit<OrdersListParams, "site_id"> = {}) =>
    api.get(`/sites/${siteId}/orders`, { params }),

  siteStats: (siteId: number) => api.get(`/sites/${siteId}/orders/stats`),

  /**
   * Tells the Portal to hit the WP agent's /sync-now endpoint, which runs the
   * ping inline. The agent calls back to /api/agent/ping during the same call,
   * so a successful response means the orders table is already fresh.
   */
  syncSite: (siteId: number) => api.post(`/sites/${siteId}/sync-now`),
};

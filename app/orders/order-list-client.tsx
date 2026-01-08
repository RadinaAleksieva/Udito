"use client";

import { useState, useCallback } from "react";

type OrderRow = {
  id: string;
  number: string | null;
  payment_status: string | null;
  status: string | null;
  created_at: string | null;
  paid_at: string | null;
  total: string | null;
  currency: string | null;
  customer_name: string | null;
  customer_email: string | null;
  raw: unknown;
  source: string | null;
};

type Props = {
  initialOrders: OrderRow[];
  initialTotal: number;
  month: string | null;
  renderOrder: (order: OrderRow, index: number) => React.ReactNode;
};

const PAGE_SIZE = 20;

export default function OrderListClient({
  initialOrders,
  initialTotal,
  month,
  renderOrder,
}: Props) {
  const [orders, setOrders] = useState<OrderRow[]>(initialOrders);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(initialOrders.length < initialTotal);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);

    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(orders.length),
      });
      if (month && month !== "all") {
        params.set("month", month);
      }

      const response = await fetch(`/api/orders/list?${params.toString()}`, {
        credentials: "include",
      });
      const data = await response.json();

      if (data.ok && data.orders) {
        setOrders((prev) => [...prev, ...data.orders]);
        setHasMore(data.hasMore);
      }
    } catch (error) {
      console.error("Failed to load more orders", error);
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore, orders.length, month]);

  return (
    <>
      <div className="order-cards">
        {orders.map((order, idx) => renderOrder(order, idx))}
      </div>
      {hasMore && (
        <div style={{ marginTop: "24px", textAlign: "center" }}>
          <button
            className="btn-secondary"
            onClick={loadMore}
            disabled={loading}
          >
            {loading ? "Зареждане..." : "Зареди още"}
          </button>
        </div>
      )}
      <p
        style={{
          marginTop: "16px",
          textAlign: "center",
          fontFamily: "Source Sans 3, sans-serif",
          fontSize: "14px",
          color: "#51607a",
        }}
      >
        Показани {orders.length} от {initialTotal} поръчки
      </p>
    </>
  );
}

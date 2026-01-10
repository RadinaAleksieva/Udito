"use client";

import { useState, ReactNode } from "react";

interface OrdersListWrapperProps {
  children: ReactNode[];
  initialLimit?: number;
}

export default function OrdersListWrapper({
  children,
  initialLimit = 20,
}: OrdersListWrapperProps) {
  const [showAll, setShowAll] = useState(false);

  const totalOrders = Array.isArray(children) ? children.length : 1;
  const displayedOrders = showAll ? children : (Array.isArray(children) ? children.slice(0, initialLimit) : children);
  const hasMore = totalOrders > initialLimit;

  return (
    <>
      <div className="order-cards">
        {displayedOrders}
      </div>
      {hasMore && !showAll && (
        <div style={{ marginTop: '24px', textAlign: 'center' }}>
          <button
            className="cta cta-secondary"
            onClick={() => setShowAll(true)}
          >
            Виж всички ({totalOrders} поръчки)
          </button>
        </div>
      )}
    </>
  );
}

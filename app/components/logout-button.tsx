"use client";

import { signOut } from "next-auth/react";

export default function LogoutButton() {
  async function handleLogout() {
    // Clear cookies first
    await fetch("/api/logout", { method: "GET" });
    // Then sign out from NextAuth
    await signOut({ callbackUrl: "/login" });
  }

  return (
    <button onClick={handleLogout} className="nav-link nav-link--button">
      Изход
    </button>
  );
}

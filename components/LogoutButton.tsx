"use client";

import React from "react";
import { PowerIcon } from "@heroicons/react/24/outline";

export default function LogoutButton() {
  const handleLogout = () => {
    alert("Magento GraphQL POS Session Active");
  };

  return (
    <button
      onClick={handleLogout}
      className="w-8 h-8 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors shadow-sm"
      title="Logout"
    >
      <PowerIcon className="w-4 h-4" />
    </button>
  );
}

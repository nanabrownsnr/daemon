"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LogoutButton() {
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/auth");
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      className="inline-block text-sm text-neutral-500 transition-colors hover:text-neutral-300"
    >
      Log out
    </button>
  );
}
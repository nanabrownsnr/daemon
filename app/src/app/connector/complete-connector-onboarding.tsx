"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

export default function CompleteConnectorOnboarding() {
  useEffect(() => {
    const supabase = createClient();

    async function markComplete() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.user_metadata.needs_connector_onboarding === true) {
        await supabase.auth.updateUser({
          data: { needs_connector_onboarding: false },
        });
      }
    }

    void markComplete();
  }, []);

  return null;
}

"use client";

import { useSyncExternalStore } from "react";
import CopyCommand from "./copy-command";

export default function LoginCommand() {
  const origin = useSyncExternalStore(
    () => () => undefined,
    () => window.location.origin,
    () => "http://localhost:3000",
  );

  return <CopyCommand command={`groupwork-connect login --app-url ${origin}`} />;
}

// web/components/AuthGuard.tsx
"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";

const PUBLIC_PATHS = ["/login", "/register-admin"];

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!ready) return; // wait until auth is loaded from localStorage

    const path = pathname || "/";
    const isPublic = PUBLIC_PATHS.includes(path);

    if (isPublic) {
      // If logged in and on login/register, send to inbox
      if (user) {
        router.replace("/inbox");
      }
      setChecked(true);
      return;
    }

    // Protected route: if not logged in, go to login
    if (!user) {
      router.replace("/login");
      setChecked(true);
      return;
    }

    setChecked(true);
  }, [ready, user, pathname, router]);

  if (!ready || !checked) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] text-ui-dim text-sm">
        Inapakia...
      </div>
    );
  }

  const path = pathname || "/";
  const isPublic = PUBLIC_PATHS.includes(path);

  if (isPublic && !user) {
    // login / register-admin while logged out
    return <>{children}</>;
  }

  if (!user) {
    // We're redirecting to login; nothing to render
    return null;
  }

  return <>{children}</>;
}

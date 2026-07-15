import { redirect } from "next/navigation";

import { AppShell } from "@/components/shell";
import { currentUser } from "@/lib/auth";
import { getRecentNotifications, getUnreadNotificationCount } from "@/lib/notifications";

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await currentUser();
  if (!user) {
    redirect("/login");
  }

  const [notifications, unreadCount] = await Promise.all([
    getRecentNotifications(user.id),
    getUnreadNotificationCount(user.id),
  ]);

  return (
    <AppShell user={user} notifications={notifications} unreadCount={unreadCount}>
      {children}
    </AppShell>
  );
}

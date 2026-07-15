import Link from "next/link";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  PageHeader,
} from "@/components/ui";
import { markAllNotificationsReadAction, markNotificationReadAction } from "@/lib/actions/notifications";
import { currentUser } from "@/lib/auth";
import { getNotifications } from "@/lib/notifications";
import { formatDateTime } from "@/lib/utils";

function toneForType(type: string) {
  if (type === "SUCCESS") return "success" as const;
  if (type === "WARNING") return "warning" as const;
  if (type === "ERROR") return "danger" as const;
  return "info" as const;
}

export default async function NotificationsPage() {
  const user = await currentUser();
  if (!user) return null;

  const notifications = await getNotifications(user.id);
  const unreadCount = notifications.filter((item) => !item.readAt).length;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Notifications"
        title="Notification center"
        description="Review platform updates and mark items as read."
        actions={
          <form action={markAllNotificationsReadAction}>
            <input type="hidden" name="returnTo" value="/notifications" />
            <Button type="submit" variant="outline">
              Mark all read
            </Button>
          </form>
        }
      />

      <Card>
        <CardHeader className="flex items-center justify-between gap-4">
          <CardTitle>Inbox</CardTitle>
          <Badge tone="info">{unreadCount} unread</Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          {notifications.length === 0 ? (
            <EmptyState
              title="No notifications"
              description="You will see system notices and development messages here."
            />
          ) : (
            notifications.map((notification) => (
              <div
                key={notification.id}
                className={`rounded-2xl border p-4 ${
                  notification.readAt ? "border-sourcehub-border bg-white" : "border-sourcehub-accent/20 bg-sourcehub-accent/5"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-sourcehub-text">{notification.title}</p>
                      <Badge tone={toneForType(notification.type)}>{notification.type}</Badge>
                    </div>
                    <p className="text-sm text-slate-600">{notification.message}</p>
                    <p className="text-xs uppercase tracking-wide text-slate-400">
                      {formatDateTime(notification.createdAt)}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2">
                    {notification.link ? (
                      <Link href={notification.link} className="text-sm font-medium text-sourcehub-primary hover:text-sourcehub-secondary">
                        Open
                      </Link>
                    ) : null}
                    {!notification.readAt ? (
                      <form action={markNotificationReadAction}>
                        <input type="hidden" name="notificationId" value={notification.id} />
                        <input type="hidden" name="returnTo" value="/notifications" />
                        <Button type="submit" size="sm" variant="ghost">
                          Mark read
                        </Button>
                      </form>
                    ) : null}
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

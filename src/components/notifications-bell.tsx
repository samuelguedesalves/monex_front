import { useState } from "react";
import { useMutation, useQuery } from "@apollo/client/react";
import { Bell, ChevronLeft, ChevronRight, Globe, User } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";
import { formatRelativeTime, parseApiDate } from "@/lib/dateFormatter";
import {
  MARK_ALL_NOTIFICATIONS_AS_READ_MUTATION,
  MARK_NOTIFICATION_AS_READ_MUTATION,
  NOTIFICATIONS_PAGE_SIZE,
  NOTIFICATIONS_QUERY,
  UNREAD_NOTIFICATIONS_COUNT_QUERY,
  type Notification,
  type NotificationsPage,
} from "@/graphql/notification";

const UNREAD_POLL_INTERVAL_MS = 30_000;

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error && err.message ? err.message : fallback;
}

export function NotificationsBell() {
  const { token } = useAuth();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);

  const { data: countData } = useQuery<{ unreadNotificationsCount: number }>(
    UNREAD_NOTIFICATIONS_COUNT_QUERY,
    { skip: !token, pollInterval: UNREAD_POLL_INTERVAL_MS }
  );

  const { data, loading, error } = useQuery<{
    notifications: NotificationsPage;
  }>(NOTIFICATIONS_QUERY, {
    variables: { page },
    skip: !token || !open,
    fetchPolicy: "cache-and-network",
  });

  const [markAsRead] = useMutation<
    { markNotificationAsRead: Pick<Notification, "id" | "read" | "readAt"> },
    { id: number }
  >(MARK_NOTIFICATION_AS_READ_MUTATION, {
    refetchQueries: [UNREAD_NOTIFICATIONS_COUNT_QUERY],
  });

  const [markAllAsRead, { loading: markingAll }] = useMutation<{
    markAllNotificationsAsRead: number;
  }>(MARK_ALL_NOTIFICATIONS_AS_READ_MUTATION, {
    refetchQueries: [NOTIFICATIONS_QUERY, UNREAD_NOTIFICATIONS_COUNT_QUERY],
  });

  const unreadCount = countData?.unreadNotificationsCount ?? 0;
  const notifications = data?.notifications.notifications ?? [];
  const quantity = data?.notifications.quantity ?? 0;
  const hasPrevious = page > 1;
  const hasNext = quantity === NOTIFICATIONS_PAGE_SIZE;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) setPage(1);
  }

  async function handleMarkAsRead(notification: Notification) {
    if (notification.read) return;
    try {
      await markAsRead({ variables: { id: notification.id } });
    } catch (err) {
      toast.error(errorMessage(err, "Failed to mark notification as read"));
    }
  }

  async function handleMarkAllAsRead() {
    try {
      await markAllAsRead();
    } catch (err) {
      toast.error(errorMessage(err, "Failed to mark notifications as read"));
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative flex items-center"
          aria-label={
            unreadCount > 0
              ? `Notifications, ${unreadCount} unread`
              : "Notifications"
          }
        >
          <Bell />
          {unreadCount > 0 && (
            <span className="absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-none font-semibold text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-96 gap-0 p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="font-medium">Notifications</p>
          <Button
            variant="link"
            size="sm"
            className="h-auto px-0"
            disabled={unreadCount === 0 || markingAll}
            onClick={handleMarkAllAsRead}
          >
            Mark all as read
          </Button>
        </div>

        <div className="max-h-96 overflow-y-auto">
          {error ? (
            <p className="px-4 py-6 text-center text-destructive">
              {error.message || "Failed to load notifications"}
            </p>
          ) : loading && notifications.length === 0 ? (
            <p className="px-4 py-6 text-center text-muted-foreground">
              Loading...
            </p>
          ) : notifications.length === 0 ? (
            <p className="px-4 py-6 text-center text-muted-foreground">
              {page === 1 ? "No notifications yet" : "No more notifications"}
            </p>
          ) : (
            <ul>
              {notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onSelect={handleMarkAsRead}
                />
              ))}
            </ul>
          )}
        </div>

        {(hasPrevious || hasNext) && (
          <div className="flex items-center justify-between border-t px-2 py-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={!hasPrevious || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft />
              Newer
            </Button>
            <span className="text-xs text-muted-foreground">Page {page}</span>
            <Button
              variant="ghost"
              size="sm"
              disabled={!hasNext || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Older
              <ChevronRight />
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

type NotificationItemProps = {
  notification: Notification;
  onSelect: (notification: Notification) => void;
};

function NotificationItem({ notification, onSelect }: NotificationItemProps) {
  const createdAt = parseApiDate(notification.insertedAt);
  const TypeIcon = notification.type === "global" ? Globe : User;

  return (
    <li className="border-b last:border-b-0">
      <button
        type="button"
        onClick={() => onSelect(notification)}
        className={cn(
          "flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-muted",
          notification.read ? "cursor-default" : "bg-muted/40"
        )}
      >
        <TypeIcon
          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          aria-label={notification.type}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-start justify-between gap-2">
            <p className={cn("text-sm", !notification.read && "font-semibold")}>
              {notification.title}
            </p>
            {!notification.read && (
              <span
                className="mt-1.5 size-2 shrink-0 rounded-full bg-primary"
                aria-label="unread"
              />
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {notification.content}
          </p>
          <time
            dateTime={createdAt.toISOString()}
            title={createdAt.toLocaleString()}
            className="text-xs text-muted-foreground"
          >
            {formatRelativeTime(createdAt)}
          </time>
        </div>
      </button>
    </li>
  );
}

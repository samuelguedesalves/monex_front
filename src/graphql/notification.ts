import { gql } from "@apollo/client";

export const NOTIFICATIONS_QUERY = gql`
  query notifications($page: Int!) {
    notifications(page: $page) {
      notifications {
        id
        title
        content
        type
        read
        readAt
        insertedAt
      }
      page
      previousPage
      nextPage
      quantity
    }
  }
`;

export const UNREAD_NOTIFICATIONS_COUNT_QUERY = gql`
  query unreadNotificationsCount {
    unreadNotificationsCount
  }
`;

export const MARK_NOTIFICATION_AS_READ_MUTATION = gql`
  mutation markNotificationAsRead($id: Int!) {
    markNotificationAsRead(id: $id) {
      id
      read
      readAt
    }
  }
`;

export const MARK_ALL_NOTIFICATIONS_AS_READ_MUTATION = gql`
  mutation markAllNotificationsAsRead {
    markAllNotificationsAsRead
  }
`;

export const NOTIFICATIONS_PAGE_SIZE = 10;

export type NotificationType = "global" | "personal";

export type Notification = {
  id: number;
  title: string;
  content: string;
  type: NotificationType;
  read: boolean;
  /** Naive UTC ISO8601 (no "Z"); parse with `parseApiDate`. Null while unread. */
  readAt: string | null;
  /** Naive UTC ISO8601 (no "Z"); parse with `parseApiDate`. */
  insertedAt: string;
};

export type NotificationsPage = {
  notifications: Notification[];
  page: number;
  /** Always page - 1, clamped to 1 — never null. */
  previousPage: number;
  /** Always page + 1 — never null; use `quantity === NOTIFICATIONS_PAGE_SIZE` to detect more. */
  nextPage: number;
  quantity: number;
};

import { gql } from "@apollo/client";

export const USER_BY_EMAIL_QUERY = gql`
  query userByEmail($email: String!) {
    userByEmail(email: $email) {
      id
      firstName
      lastName
      email
    }
  }
`;

export const CREATE_TRANSACTION_MUTATION = gql`
  mutation createTransaction($amount: Int!, $userId: Int!) {
    createTransaction(input: { amount: $amount, userId: $userId }) {
      id
      amount
      fromUser
      toUser
      processedAt
    }
  }
`;

export const TRANSACTIONS_FROM_USER_QUERY = gql`
  query transactionsFromUser($page: Int!) {
    transactionsFromUser(page: $page) {
      transactions {
        id
        amount
        fromUser
        toUser
        processedAt
        status
      }
      page
      previousPage
      nextPage
      quantity
    }
  }
`;

export type TransferRecipient = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
};

export type Transaction = {
  id: number;
  amount: number;
  fromUser: number;
  toUser: number;
  processedAt: string;
  status: string;
};

export type TransactionsPage = {
  transactions: Transaction[];
  page: number;
  previousPage: number;
  nextPage: number;
  quantity: number;
};

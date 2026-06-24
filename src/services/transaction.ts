const GQL_ENDPOINT = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";

const USER_BY_EMAIL_QUERY = `
  query userByEmail($email: String!) {
    userByEmail(email: $email) {
      id
      firstName
      lastName
      email
    }
  }
`;

const CREATE_TRANSACTION_MUTATION = `
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

const TRANSACTIONS_FROM_USER_QUERY = `
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

async function gqlRequest<T>(
  query: string,
  operationName: string,
  variables: Record<string, unknown>,
  token: string
): Promise<T> {
  const response = await fetch(GQL_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, operationName, variables }),
  });

  if (!response.ok) {
    throw new Error(`Network error: ${response.status}`);
  }

  const json = await response.json();

  if (json.errors?.length) {
    throw new Error(json.errors[0].message);
  }

  return json.data as T;
}

export async function getUserByEmail(
  email: string,
  token: string
): Promise<TransferRecipient | null> {
  const data = await gqlRequest<{ userByEmail: TransferRecipient | null }>(
    USER_BY_EMAIL_QUERY,
    "userByEmail",
    { email },
    token
  );

  return data.userByEmail ?? null;
}

export async function createTransaction(
  input: { amount: number; userId: number },
  token: string
): Promise<Transaction> {
  const data = await gqlRequest<{ createTransaction: Transaction }>(
    CREATE_TRANSACTION_MUTATION,
    "createTransaction",
    { amount: input.amount, userId: input.userId },
    token
  );

  return data.createTransaction;
}

export async function listTransactionsFromUser(
  page: number,
  token: string
): Promise<TransactionsPage> {
  const data = await gqlRequest<{ transactionsFromUser: TransactionsPage }>(
    TRANSACTIONS_FROM_USER_QUERY,
    "transactionsFromUser",
    { page },
    token
  );

  return data.transactionsFromUser;
}

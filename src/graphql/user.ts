import { gql } from "@apollo/client";

export const AUTH_USER_MUTATION = gql`
  mutation authUser($email: String!, $password: String!) {
    authUser(input: { email: $email, password: $password }) {
      user {
        id
        firstName
        lastName
        email
        balance
      }
      token
    }
  }
`;

export const CURRENT_USER_QUERY = gql`
  query currentUser {
    user {
      id
      firstName
      lastName
      email
      balance
    }
  }
`;

export type AuthUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  balance: number;
};

export type AuthResult = {
  user: AuthUser;
  token: string;
};

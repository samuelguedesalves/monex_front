const GQL_ENDPOINT = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";

const AUTH_USER_MUTATION = `
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

export async function authUser(
  email: string,
  password: string
): Promise<AuthResult> {
  const response = await fetch(GQL_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: AUTH_USER_MUTATION,
      operationName: "authUser",
      variables: { email, password },
    }),
  });

  if (!response.ok) {
    throw new Error(`Network error: ${response.status}`);
  }

  const json = await response.json();

  if (json.errors?.length) {
    throw new Error(json.errors[0].message);
  }

  const result = json.data?.authUser;
  if (!result) {
    throw new Error("Authentication failed");
  }

  return result;
}

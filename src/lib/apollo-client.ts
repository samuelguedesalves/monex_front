import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";
import { SetContextLink } from "@apollo/client/link/context";
import { ErrorLink } from "@apollo/client/link/error";
import { CombinedGraphQLErrors } from "@apollo/client/errors";

const TOKEN_KEY = "auth_token";
const USER_KEY = "auth_user";

const httpLink = new HttpLink({
  uri: import.meta.env.VITE_API_URL ?? "http://localhost:4000/api",
});

const authLink = new SetContextLink((prevContext) => {
  const token = sessionStorage.getItem(TOKEN_KEY);
  return {
    headers: {
      ...prevContext.headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };
});

const errorLink = new ErrorLink(({ error }) => {
  const isUnauthenticated =
    CombinedGraphQLErrors.is(error) &&
    error.errors.some((e) => e.message === "unauthenticated");
  if (isUnauthenticated) {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    window.location.href = "/login";
  }
});

export const apolloClient = new ApolloClient({
  link: errorLink.concat(authLink).concat(httpLink),
  cache: new InMemoryCache(),
});

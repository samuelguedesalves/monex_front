import { Container } from "@/components/container"
import { LoginForm } from "@/components/login-form";

export const Login = () => {
  return (
    <Container className="flex flex-col items-center h-full">
      <LoginForm />
    </Container>
  );
};
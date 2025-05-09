import { Container } from "@/components/container"
import { InputForm } from "@/components/login-form";

export const Login = () => {
  return (
    <Container className="flex flex-col items-center justify-center h-full">
      <h1 className="text-2xl font-bold">Login</h1>
      <InputForm />
    </Container>
  );
};
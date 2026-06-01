import { Container } from "@/components/container";
import { Login } from "@/pages/login";
export default function App() {
  return (
    <div className="h-screen grid grid-rows-[auto_1fr]">
      <div className="bg-black py-4">
        <Container>
          <p className="text-2xl font-bold italic text-white">Monex Bank</p>
        </Container>
      </div>
      <Login />
    </div>
  );

  return <Container>{/* <InputForm/> */}</Container>;
}

import { Container } from "@/components/container";

type Props = {
  variant: "simple" | "logged";
};

export function Header({ variant = "simple" }: Props) {
  return variant === "simple" ? <SimpleHeader /> : <LoggedHeader />;
}

function SimpleHeader() {
  return (
    <div className="py-4">
      <Container className="flex justify-center items-center">
        <img src="./logo-white.svg" alt="Monex" />
      </Container>
    </div>
  );
}

function LoggedHeader() {
  return (
    <div className="py-4">
      <Container className="flex justify-between items-center">
        <img src="./logo-white.svg" alt="Monex" />

        <div className="flex items-center gap-x-12">
          <div className="flex items-center gap-x-4">
            <img
              className="w-8 h-8 rounded-full"
              src="https://avatars.githubusercontent.com/u/29378652?v=4"
              alt=""
            />
            <p>Samuel G.</p>
          </div>
          <button type="button" className="flex items-center gap-x-2">
            Quit
            <img src="./icons/exit.svg" alt="" />
          </button>
        </div>
      </Container>
    </div>
  );
}

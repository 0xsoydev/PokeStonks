import { http, createConfig } from "wagmi";
import { monadTestnet } from "./chains";

export const config = createConfig({
  chains: [monadTestnet],
  transports: {
    [monadTestnet.id]: http(process.env.NEXT_PUBLIC_RPC_URL),
  },
});

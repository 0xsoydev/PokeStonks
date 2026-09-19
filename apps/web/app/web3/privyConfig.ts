import type { PrivyClientConfig } from "@privy-io/react-auth";

export const privyConfig: PrivyClientConfig = {
  loginMethods: ["google"],
  embeddedWallets: {
    ethereum: { createOnLogin: "all-users" },
  },
  appearance: {
    theme: "dark",
  },
};

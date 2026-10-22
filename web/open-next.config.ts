import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default {
  ...defineCloudflareConfig(),
  // Do not call `npm run build` here. That script is this OpenNext build.
  buildCommand: "node scripts/bundle-agent.mjs && npx next build",
};

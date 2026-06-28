import { serve } from "@hono/node-server";
import { createApp } from "./app.js";

serve(
  {
    fetch: createApp().fetch,
    port: 3000,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}/v1`);
  },
);

/* AMBAR Orlando site assistant · client config.
   proxyUrl: the deployed assistant proxy endpoint, e.g. "https://<your-project>.vercel.app/api/chat".
   Leave it empty ("") to run the widget in offline "site guide" mode (local keyword search, no AI).
   NEVER put an API key here or anywhere in this repo — the key lives only in the proxy's environment variables.
   See assistant-proxy/README.md. */
window.AMBAR_ASSISTANT_CONFIG = {
  proxyUrl: ""
};

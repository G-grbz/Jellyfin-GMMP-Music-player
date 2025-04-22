const JSON_PREFIX = "Stored JSON credentials:";
const WS_PREFIX = "opening web socket with url:";

export function saveCredentialsToSessionStorage(credentials) {
  try {
    sessionStorage.setItem("json-credentials", JSON.stringify(credentials));
    if (credentials.AccessToken) {
      sessionStorage.setItem("accessToken", credentials.AccessToken);
    }
    console.debug("📥 Kimlik bilgileri kaydedildi:", credentials);
  } catch (err) {
    console.error("❌ Kimlik bilgileri kaydedilirken hata:", err);
  }
}

export function saveApiKey(apiKey) {
  try {
    sessionStorage.setItem("api-key", apiKey);
    console.debug("📥 API anahtarı kaydedildi:", apiKey);
  } catch (err) {
    console.error("❌ API anahtarı kaydedilirken hata:", err);
  }
}

export function getAuthToken() {
  return (
    sessionStorage.getItem("api-key") ||
    sessionStorage.getItem("accessToken") ||
    new URLSearchParams(window.location.search).get("api_key") ||
    (window.ApiClient && window.ApiClient._authToken) ||
    null
  );
}

(function interceptConsoleLog() {
  const originalLog = console.log.bind(console);
  console.log = function (...args) {
    args.forEach(arg => {
      if (typeof arg === "string") {
        if (arg.startsWith(JSON_PREFIX)) {
          const jsonStr = arg.slice(JSON_PREFIX.length).trim();
          try {
            const creds = JSON.parse(jsonStr);
            saveCredentialsToSessionStorage(creds);
          } catch (err) {
            console.error("❌ JSON kredensiyelleri ayrıştırılamadı:", err);
          }
        }
        else if (arg.startsWith(WS_PREFIX)) {
          const urlPart = arg.slice(WS_PREFIX.length).trim();
          try {
            const url = new URL(urlPart);
            const apiKey = url.searchParams.get("api_key");
            if (apiKey) saveApiKey(apiKey);
          } catch (err) {
            console.error("❌ WebSocket URL'i işlenirken hata:", err);
          }
        }
      }
    });
    originalLog(...args);
  };

  if (window.ApiClient && window.ApiClient._authToken) {
    saveApiKey(window.ApiClient._authToken);
  }
})();

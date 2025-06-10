const JSON_PREFIX = "Stored JSON credentials:";
const WS_PREFIX = "opening web socket with url:";

export function saveCredentialsToSessionStorage(credentials) {
    try {
        sessionStorage.setItem("json-credentials", JSON.stringify(credentials));
        console.log("Kimlik bilgileri sessionStorage'a kaydedildi.");

        if (credentials.Servers && credentials.Servers[0] && credentials.Servers[0].LocalAddress) {
            window.serverConfig = window.serverConfig || {};
            window.serverConfig.address = credentials.Servers[0].LocalAddress;
        }
    } catch (err) {
        console.error("Kimlik bilgileri kaydedilirken hata:", err);
    }
}

export function saveApiKey(apiKey) {
    try {
        sessionStorage.setItem("api-key", apiKey);
        console.log("API anahtarı sessionStorage'a kaydedildi.");
    } catch (err) {
        console.error("API anahtarı kaydedilirken hata:", err);
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
    const originalLog = console.log;
    console.log = function (...args) {
        args.forEach(arg => {
            if (typeof arg === "string") {
                if (arg.startsWith(JSON_PREFIX)) {
                    const jsonStr = arg.slice(JSON_PREFIX.length).trim();
                    try {
                        const credentials = JSON.parse(jsonStr);
                        saveCredentialsToSessionStorage(credentials);
                    } catch (err) {
                        console.error("Kimlik bilgileri ayrıştırılırken hata:", err);
                    }
                } else if (arg.startsWith(WS_PREFIX)) {
                    const urlPart = arg.split("url:")[1]?.trim();
                    if (urlPart) {
                        try {
                            const url = new URL(urlPart);
                            const apiKey = url.searchParams.get("api_key");
                            if (apiKey) {
                                saveApiKey(apiKey);
                            }
                        } catch (err) {
                            console.error("API anahtarı çıkarılırken hata:", err);
                        }
                    }
                }
            }
        });
        originalLog.apply(console, args);
    };
})();

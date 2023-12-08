const ENDPOINT = "https://lb1.beamanalytics.io/api/log";
const TOKEN = "b0b169a6-8cd4-4a2e-951b-419b2b638ce5";

let lastPathName: string | null = null;

const trackPageView = () => {
  if (
    /^localhost$|^127(\.\d+){0,2}\.\d+$|^\[::1?]$/.test(location.hostname) ||
    location.protocol === "file:"
  ) {
    return;
  }

  if (lastPathName === location.pathname) return;
  lastPathName = location.pathname;

  const locale =
    navigator.languages && navigator.languages.length > 0
      ? navigator.languages[0]
      : navigator.language || "en";
  const urlSearchParams = new URLSearchParams(window.location.search);
  const params = Object.fromEntries(urlSearchParams.entries());

  const payload = {
    width: window.innerWidth,
    hostname: location.hostname,
    pathname: location.pathname,
    referrer: document.referrer.includes(location.origin) ? "" : document.referrer,
    user_agent: window.navigator.userAgent,
    title: document.title,
    hash: "",
    locale,
    params,
    token: TOKEN,
  };

  const request = new XMLHttpRequest();
  request.open("POST", ENDPOINT, true);
  request.setRequestHeader("Content-Type", "application/json");
  request.send(JSON.stringify(payload));
};

const main = () => {
  if ("pushState" in window.history) {
    const originalPushState = window.history["pushState"];
    window.history["pushState"] = function (...args: unknown[]) {
      Reflect.apply(originalPushState, this, args);
      trackPageView();
    };
    window.addEventListener("popstate", trackPageView);
  }

  trackPageView();
};

document.addEventListener("DOMContentLoaded", main);

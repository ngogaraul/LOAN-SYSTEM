import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  scenarios: {
    browse_flow: {
      executor: "ramping-vus",
      startVUs: 5,
      stages: [
        { duration: "30s", target: 25 },
        { duration: "1m", target: 50 },
        { duration: "30s", target: 0 },
      ],
      gracefulRampDown: "15s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<800"],
  },
};

function getAccessToken() {
  if (__ENV.ACCESS_TOKEN) {
    return __ENV.ACCESS_TOKEN;
  }

  const loginUrl = __ENV.BACKEND_LOGIN_URL || `${__ENV.BASE_URL || "http://localhost:9000"}/auth/login`;
  const username = __ENV.OIDC_USERNAME;
  const password = __ENV.OIDC_PASSWORD;

  if (!loginUrl || !username || !password) {
    throw new Error("Missing ACCESS_TOKEN or backend login env vars.");
  }

  const response = http.post(
    loginUrl,
    JSON.stringify({
      email: username,
      password,
    }),
    { headers: { "Content-Type": "application/json" } },
  );

  check(response, { "token request ok": (r) => r.status === 200 });
  return response.json("token");
}

export function setup() {
  return {
    baseUrl: __ENV.BASE_URL || "http://localhost:9000",
    token: getAccessToken(),
  };
}

export default function (data) {
  const params = {
    headers: {
      Authorization: `Bearer ${data.token}`,
    },
  };

  const dashboard = http.get(`${data.baseUrl}/dashboard/`, params);
  check(dashboard, { "dashboard ok": (r) => r.status === 200 });

  const apps = http.get(`${data.baseUrl}/applications/?page=1&page_size=20`, params);
  check(apps, { "applications ok": (r) => r.status === 200 });

  const clients = http.get(`${data.baseUrl}/clients/?page=1&page_size=20`, params);
  check(clients, { "clients ok": (r) => r.status === 200 });

  sleep(1);
}

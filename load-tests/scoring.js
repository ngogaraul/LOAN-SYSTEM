import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  scenarios: {
    scoring_flow: {
      executor: "ramping-vus",
      startVUs: 1,
      stages: [
        { duration: "20s", target: 5 },
        { duration: "40s", target: 10 },
        { duration: "20s", target: 0 },
      ],
      gracefulRampDown: "15s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.1"],
    http_req_duration: ["p(95)<3000"],
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

function resolveApplicationId(baseUrl, token) {
  if (__ENV.APPLICATION_ID) {
    return __ENV.APPLICATION_ID;
  }

  const response = http.get(`${baseUrl}/applications/?status=SUBMITTED&page=1&page_size=1`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  check(response, { "submitted applications listed": (r) => r.status === 200 });
  const items = response.json("items") || [];
  if (!items.length) {
    throw new Error("No SUBMITTED application available. Provide APPLICATION_ID.");
  }
  return items[0].id;
}

export function setup() {
  const baseUrl = __ENV.BASE_URL || "http://localhost:9000";
  const token = getAccessToken();
  const applicationId = resolveApplicationId(baseUrl, token);
  return { baseUrl, token, applicationId };
}

export default function (data) {
  const response = http.post(
    `${data.baseUrl}/applications/${data.applicationId}/score`,
    null,
    {
      headers: {
        Authorization: `Bearer ${data.token}`,
      },
    },
  );

  check(response, {
    "score request acceptable": (r) => [200, 409].includes(r.status),
  });

  sleep(1);
}

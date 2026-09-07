const API_BASE = import.meta.env.VITE_API_BASE || "/api";

async function request(path, options = {}) {
  const token = localStorage.getItem("ft_token");
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ? JSON.stringify(body.error) : `Request failed: ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

export function getBigBoard({ departDate, maxBudgetInr, region, passportCountry }) {
  const params = new URLSearchParams({ departDate });
  if (maxBudgetInr) params.set("maxBudgetInr", maxBudgetInr);
  if (region) params.set("region", region);
  if (passportCountry) params.set("passportCountry", passportCountry);
  return request(`/flights/big-board?${params}`);
}

export function getDateGrid(destination, departDate) {
  return request(`/flights/date-grid/${destination}?departDate=${departDate}`);
}

export function getDestinationDetail(destination) {
  return request(`/flights/detail/${destination}`);
}

export function getDestinations() {
  return request("/flights/destinations");
}

export function createAlert(payload) {
  return request("/alerts", { method: "POST", body: JSON.stringify(payload) });
}

export function listAlerts() {
  return request("/alerts");
}

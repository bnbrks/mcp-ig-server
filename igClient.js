import axios from "axios";

export class IGClient {
  constructor(apiKey, identifier, password, baseUrl) {
    this.apiKey = apiKey;
    this.identifier = identifier;
    this.password = password;
    this.baseUrl = baseUrl;
    this.client = axios.create({
      baseURL: baseUrl,
      headers: { "X-IG-API-KEY": apiKey, "Content-Type": "application/json" }
    });
    this.securityToken = null;
    this.cst = null;
  }

  async login() {
    const resp = await this.client.post("/session", {
      identifier: this.identifier,
      password: this.password,
    });
    this.cst = resp.headers["cst"];
    this.securityToken = resp.headers["x-security-token"];
    this.client.defaults.headers["CST"] = this.cst;
    this.client.defaults.headers["X-SECURITY-TOKEN"] = this.securityToken;
  }

  async ensureAuth() {
    if (!this.cst) await this.login();
  }

  async getHistorical(epic, resolution, max) {
    await this.ensureAuth();
    const resp = await this.client.get(`/prices/${epic}`, {
      params: { resolution, max },
    });
    return resp.data;
  }

  async getHistoricalRange(epic, resolution, from, to) {
    await this.ensureAuth();
    const resp = await this.client.get(`/prices/${epic}`, {
      params: { resolution, from, to },
    });
    return resp.data;
  }

  async placeTrade(body) {
    await this.ensureAuth();
    const resp = await this.client.post("/positions/otc", body);
    return resp.data;
  }
}

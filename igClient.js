import axios from "axios";

export default class IGClientV3 {
  constructor() {
    this.apiKey = process.env.IG_API_KEY;
    this.username = process.env.IG_USERNAME;
    this.password = process.env.IG_PASSWORD;
    this.accountId = process.env.IG_ACCOUNT_ID;
    this.baseUrl = process.env.IG_BASE_URL || "https://api.ig.com/gateway/deal";
    this.cst = null;
    this.token = null;
  }

  async login() {
    const res = await axios.post(
      this.baseUrl + "/session",
      {
        identifier: this.username,
        password: this.password
      },
      {
        headers: {
          "X-IG-API-KEY": this.apiKey,
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Version": "3"
        }
      }
    );

    this.cst = res.headers["cst"];
    this.token = res.headers["x-security-token"];
  }

  async authed() {
    if (!this.cst || !this.token) await this.login();
    return {
      "X-IG-API-KEY": this.apiKey,
      "X-SECURITY-TOKEN": this.token,
      "CST": this.cst,
      "Version": "3",
      "Content-Type": "application/json",
      "Accept": "application/json"
    };
  }

  async getPositions() {
    const h = await this.authed();
    const res = await axios.get(this.baseUrl + "/positions", { headers: h });
    return res.data;
  }

  async getPrice(epic) {
    const h = await this.authed();
    const res = await axios.get(this.baseUrl + `/markets/${epic}`, { headers: h });
    return res.data;
  }

  async getHistorical(epic, resolution, range) {
    const h = await this.authed();
    const to = new Date();
    const from = new Date(Date.now() - range * 60000);
    const res = await axios.get(
      this.baseUrl + `/prices/${epic}?resolution=${resolution}&from=${from.toISOString()}&to=${to.toISOString()}`,
      { headers: h }
    );
    return res.data;
  }

  async getHistoricalRange(epic, resolution, from, to) {
    const h = await this.authed();
    const res = await axios.get(
      this.baseUrl + `/prices/${epic}?resolution=${resolution}&from=${from}&to=${to}`,
      { headers: h }
    );
    return res.data;
  }

  async openPosition(body) {
    const h = await this.authed();
    const res = await axios.post(this.baseUrl + "/positions", body, { headers: h });
    return res.data;
  }

  async closePosition(dealId) {
    const h = await this.authed();
    const res = await axios.delete(this.baseUrl + `/positions/${dealId}`, { headers: h });
    return res.data;
  }
}

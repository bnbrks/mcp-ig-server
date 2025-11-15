import axios from "axios";

export default class IGClient {
  constructor() {
    this.apiKey = process.env.IG_API_KEY;
    this.identifier = process.env.IG_IDENTIFIER;
    this.password = process.env.IG_PASSWORD;
    this.accountId = process.env.IG_ACCOUNT_ID;
    this.useDemo = process.env.IG_USE_DEMO === "true";

    this.apiUrl = this.useDemo
      ? "https://demo-api.ig.com/gateway/deal"
      : "https://api.ig.com/gateway/deal";

    this.cst = null;
    this.token = null;
  }

  async ensureSession() {
    if (this.cst && this.token) return;

    const res = await axios.post(
      this.apiUrl + "/session",
      {
        identifier: this.identifier,
        password: this.password
      },
      {
        headers: {
          "X-IG-API-KEY": this.apiKey,
          "Content-Type": "application/json"
        }
      }
    );

    this.cst = res.headers["cst"];
    this.token = res.headers["x-security-token"];
  }

  async headers() {
    await this.ensureSession();
    return {
      "X-IG-API-KEY": this.apiKey,
      "CST": this.cst,
      "X-SECURITY-TOKEN": this.token,
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Version": "2"
    };
  }

  async getMarkets(searchTerm) {
    const h = await this.headers();
    const res = await axios.get(this.apiUrl + "/markets", {
      params: { searchTerm },
      headers: h
    });
    return res.data;
  }

  async placeTrade(body) {
    const h = await this.headers();
    const res = await axios.post(
      this.apiUrl + "/positions/otc",
      body,
      { headers: h }
    );
    return res.data;
  }

  async getHistorical(epic, resolution, max = 100) {
    const h = await this.headers();
    const res = await axios.get(`${this.apiUrl}/prices/${epic}`, {
      params: { resolution, max },
      headers: h
    });
    return res.data;
  }

  async getHistoricalRange(epic, resolution, from, to) {
    const h = await this.headers();
    const res = await axios.get(`${this.apiUrl}/prices/${epic}`, {
      params: { resolution, from, to },
      headers: h
    });
    return res.data;
  }

  async call(endpoint, opts) {
    const h = await this.headers();
    const url = this.apiUrl + "/" + endpoint;

    if (!opts.method || opts.method.toUpperCase() === "GET") {
      return (
        await axios.get(url, {
          headers: h,
          params: opts.params || {}
        })
      ).data;
    }

    return (
      await axios({
        url,
        method: opts.method.toUpperCase(),
        headers: h,
        data: opts.body || {}
      })
    ).data;
  }
}

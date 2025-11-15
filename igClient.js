import axios from "axios";

export default class IGClient {
  constructor() {
    this.key = process.env.IG_API_KEY;
    this.user = process.env.IG_IDENTIFIER;
    this.pass = process.env.IG_PASSWORD;
    this.acc = process.env.IG_ACCOUNT_ID;
    this.base = "https://api.ig.com/gateway/deal";
    this.cst = null;
    this.token = null;
  }

  async session() {
    if (this.cst && this.token) return;
    const r = await axios.post(
      this.base + "/session",
      { identifier: this.user, password: this.pass },
      {
        headers: {
          "X-IG-API-KEY": this.key,
          "Content-Type": "application/json"
        }
      }
    );

    this.cst = r.headers["cst"];
    this.token = r.headers["x-security-token"];
  }

  async h() {
    await this.session();
    return {
      "X-IG-API-KEY": this.key,
      CST: this.cst,
      "X-SECURITY-TOKEN": this.token,
      "Content-Type": "application/json",
      Accept: "application/json"
    };
  }

  async getMarketDetails(epic) {
    return (
      await axios.get(this.base + "/markets/" + epic, {
        headers: await this.h()
      })
    ).data;
  }

  async getHistoricalPrices(epic, resolution, max = 100) {
    return (
      await axios.get(
        `${this.base}/prices/${epic}?resolution=${resolution}&max=${max}`,
        { headers: await this.h() }
      )
    ).data;
  }

  async placeOrder(body) {
    return (
      await axios.post(this.base + "/positions/otc", body, {
        headers: await this.h()
      })
    ).data;
  }

  async getPositions() {
    return (
      await axios.get(this.base + "/positions", { headers: await this.h() })
    ).data;
  }

  async getAccountSummary() {
    return (
      await axios.get(this.base + "/accounts", { headers: await this.h() })
    ).data;
  }

  async closePosition(dealId) {
    return (
      await axios.post(
        this.base + "/positions/otc",
        { dealId, direction: "SELL", size: 1 },
        { headers: await this.h() }
      )
    ).data;
  }
}

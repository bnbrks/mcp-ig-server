import axios from "axios";

export class IGClient {
  constructor() {
    this.apiKey = process.env.IG_API_KEY;
    this.username = process.env.IG_USERNAME;
    this.password = process.env.IG_PASSWORD;
    this.apiUrl = process.env.IG_API_URL || "https://api.ig.com/gateway/deal";
    this.cst = null;
    this.token = null;
  }

  async ensureSession() {
    if (this.cst && this.token) return;
    const res = await axios.post(this.apiUrl + "/session", {
      identifier: this.username,
      password: this.password
    },{
      headers:{ "X-IG-API-KEY": this.apiKey, "Content-Type":"application/json" }
    });
    this.cst = res.headers["cst"];
    this.token = res.headers["x-security-token"];
  }

  async getMarkets(term) {
    await this.ensureSession();
    const res = await axios.get(this.apiUrl + "/markets",{
      params:{ searchTerm: term },
      headers:{
        "X-IG-API-KEY":this.apiKey,
        "CST":this.cst,
        "X-SECURITY-TOKEN":this.token
      }
    });
    return res.data;
  }

  async placeTrade(params) {
    await this.ensureSession();
    const res = await axios.post(this.apiUrl + "/positions/otc", params,{
      headers:{
        "X-IG-API-KEY":this.apiKey,
        "CST":this.cst,
        "X-SECURITY-TOKEN":this.token,
        "Content-Type":"application/json",
        "Version":"2"
      }
    });
    return res.data;
  }
}

import axios from "axios";

export class IGClient {
    constructor() {
        this.apiKey = process.env.IG_API_KEY;
        this.username = process.env.IG_USERNAME;
        this.password = process.env.IG_PASSWORD;
        this.apiUrl = process.env.IG_API_URL || "https://api.ig.com/gateway/deal";
        this.securityToken = null;
        this.cst = null;
    }

    async ensureSession() {
        if (this.cst && this.securityToken) return;

        const body = {
            identifier: this.username,
            password: this.password,
        };

        const headers = {
            "X-IG-API-KEY": this.apiKey,
            "Content-Type": "application/json",
            "Accept": "application/json",
        };

        const res = await axios.post(`${this.apiUrl}/session`, body, { headers });

        this.cst = res.headers["cst"];
        this.securityToken = res.headers["x-security-token"];
    }

    async getMarkets(searchTerm) {
        await this.ensureSession();

        const res = await axios.get(
            `${this.apiUrl}/markets?searchTerm=${encodeURIComponent(searchTerm)}`,
            {
                headers: {
                    "X-IG-API-KEY": this.apiKey,
                    "X-SECURITY-TOKEN": this.securityToken,
                    "CST": this.cst,
                    "Accept": "application/json",
                },
            }
        );

        return res.data;
    }

    async placeTrade(params) {
        await this.ensureSession();

        const res = await axios.post(
            `${this.apiUrl}/positions/otc`,
            params,
            {
                headers: {
                    "X-IG-API-KEY": this.apiKey,
                    "X-SECURITY-TOKEN": this.securityToken,
                    "CST": this.cst,
                    "Version": "2",
                    "Content-Type": "application/json",
                },
            }
        );

        return res.data;
    }
}

export default class IGClient {
  constructor(opts) {
    this.opts = opts;
  }

  async getHistoricalPrices(epic, resolution, max) {
    return { epic, resolution, max, mock: true };
  }
}

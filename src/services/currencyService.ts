export interface ExchangeRates {
  base: string;
  date: string;
  rates: {
    [key: string]: number;
  };
}

class CurrencyService {
  private cache: ExchangeRates | null = null;
  private lastFetch: number = 0;
  private readonly CACHE_DURATION = 1000 * 60 * 60; // 1 hour

  async getRates(): Promise<ExchangeRates | null> {
    const now = Date.now();
    if (this.cache && (now - this.lastFetch < this.CACHE_DURATION)) {
      return this.cache;
    }

    try {
      const response = await fetch('https://api.exchangerate-api.com/v4/latest/IDR');
      if (!response.ok) throw new Error('Failed to fetch exchange rates');
      const data = await response.json();
      this.cache = data;
      this.lastFetch = now;
      return data;
    } catch (error) {
      console.error('Error fetching exchange rates:', error);
      return null;
    }
  }

  async convertIDRtoUSD(amount: number): Promise<number | null> {
    const rates = await this.getRates();
    if (!rates || !rates.rates.USD) return null;
    return amount * rates.rates.USD;
  }

  formatIDR(amount: number): string {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(amount);
  }

  formatUSD(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  }
}

export const currencyService = new CurrencyService();

// 50 large-cap NSE stocks used for the market-breadth core. Edit freely; index membership changes over time.
const RAW = 'RELIANCE:Energy|HDFCBANK:Banking|ICICIBANK:Banking|INFY:IT|TCS:IT|ITC:FMCG|LT:Infra|BHARTIARTL:Telecom|SBIN:Banking|AXISBANK:Banking|KOTAKBANK:Banking|HINDUNILVR:FMCG|BAJFINANCE:Finance|M&M:Auto|SUNPHARMA:Pharma|MARUTI:Auto|TATAMOTORS:Auto|NTPC:Power|HCLTECH:IT|TITAN:Consumer|ULTRACEMCO:Cement|POWERGRID:Power|ASIANPAINT:Consumer|TATASTEEL:Metal|ONGC:Energy|ADANIPORTS:Infra|COALINDIA:Energy|BAJAJFINSV:Finance|NESTLEIND:FMCG|JSWSTEEL:Metal|GRASIM:Cement|TECHM:IT|WIPRO:IT|HINDALCO:Metal|CIPLA:Pharma|DRREDDY:Pharma|BAJAJ-AUTO:Auto|EICHERMOT:Auto|HEROMOTOCO:Auto|BRITANNIA:FMCG|APOLLOHOSP:Pharma|TATACONSUM:FMCG|SBILIFE:Finance|HDFCLIFE:Finance|INDUSINDBK:Banking|SHRIRAMFIN:Finance|BEL:Infra|TRENT:Consumer|ADANIENT:Infra|JIOFIN:Finance';

export const UNIVERSE = RAW.split('|').map((r) => {
  const [sym, sector] = r.split(':');
  return { sym, sector };
});

// Extra sector hints for common holdings outside the 50.
export const SECTOR_HINTS = {
  IRFC: 'PSU Finance', PFC: 'PSU Finance', RECLTD: 'PSU Finance', NIFTYBEES: 'Index ETF', BANKBEES: 'Index ETF',
  JUNIORBEES: 'Index ETF', GOLDBEES: 'Gold ETF', HAL: 'Defence', BHEL: 'Infra', IRCTC: 'Consumer', ZOMATO: 'Consumer',
  ETERNAL: 'Consumer', DMART: 'Consumer', VEDL: 'Metal', TATAPOWER: 'Power', ADANIGREEN: 'Power', DLF: 'Realty',
  GODREJPROP: 'Realty', LICI: 'Finance', PAYTM: 'Finance', NYKAA: 'Consumer', LTIM: 'IT', MPHASIS: 'IT', PERSISTENT: 'IT',
};

export function sectorOf(sym) {
  const u = UNIVERSE.find((x) => x.sym === sym);
  return u ? u.sector : SECTOR_HINTS[sym] || 'Other';
}

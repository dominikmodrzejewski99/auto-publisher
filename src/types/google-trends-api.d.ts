declare module 'google-trends-api' {
  interface TrendsOptions {
    geo?: string;
    keyword?: string;
    startTime?: Date;
    endTime?: Date;
    category?: number;
  }

  const googleTrends: {
    dailyTrends(options: TrendsOptions): Promise<string>;
    relatedQueries(options: TrendsOptions): Promise<string>;
    interestOverTime(options: TrendsOptions): Promise<string>;
  };

  export default googleTrends;
}

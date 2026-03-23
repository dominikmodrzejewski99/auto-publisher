export interface Config {
  openRouterApiKey: string;
  unsplashAccessKey: string;
  googleClientId: string;
  googleClientSecret: string;
  googleRefreshToken: string;
  bloggerBlogId: string;
  fbPageAccessToken: string;
  fbPageId: string;
  fbAppId: string;
  fbAppSecret: string;
  dryRun: boolean;
}

export interface Category {
  name: string;
  keywords: string[];
}

export interface CategoriesData {
  categories: Category[];
}

export interface Topic {
  title: string;
  slug: string;
  metaDescription: string;
  keywords: string[];
  category: string;
}

export interface UnsplashImage {
  url: string;
  alt: string;
  credit: string;
}

export interface GeneratedArticle {
  content: string;
  wordCount: number;
  headings: string[];
}

export interface PublishedArticle {
  title: string;
  slug: string;
  url: string;
  category: string;
  publishedAt: string;
  fbPostId?: string;
}

export interface PublishedData {
  articles: PublishedArticle[];
}

export interface FbScheduleSlot {
  hour: number;
  minute: number;
}

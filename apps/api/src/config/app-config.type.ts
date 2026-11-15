export type AppConfig = {
  nodeEnv: string;
  name: string;
  frontendDomain: string;
  corsOrigins: string[];
  port: number;
  fallbackLanguage: string;
  trustProxyHops: number;
};

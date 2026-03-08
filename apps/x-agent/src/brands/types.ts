export interface BrandVoice {
  name: string;
  handle: string;
  oneLiner: string;
  oneLinerEs: string;
  targetAudience: string;
  tone: string[];
  personality: string;
  avoidPatterns: string[];
  exampleTweets: string[];
  topics: string[];
  neverTopics: string[];
  contentPillars: {
    domainInsights: number;
    buildInPublic: number;
    uxShowcase: number;
    productMilestone: number;
  };
  languages: ('en' | 'es')[];
  casualnessLevel: number;
  timezone: string;
  activeHours: {
    start: number;
    end: number;
  };
}

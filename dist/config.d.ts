import "dotenv/config";
export declare const config: {
    readonly cerebrasApiKey: string;
    readonly reviewModel: string;
    readonly githubToken: string;
    readonly riskThresholdForComment: "low" | "medium" | "high";
    readonly memoryDbPath: string;
};

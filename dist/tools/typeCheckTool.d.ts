/**
 * Wraps `tsc --noEmit` as a function the agent can call.
 *
 * Type errors are exactly the class of issue an LLM is unreliable at
 * deriving from scratch (it has to track type flow across files) but
 * which the compiler reports with perfect precision. See ARCHITECTURE.md
 * decision 2.
 */
import { ToolFinding } from "../types";
export declare function runTypeCheck(): Promise<ToolFinding[]>;
export declare const typeCheckToolDefinition: {
    type: "function";
    function: {
        name: string;
        description: string;
        parameters: {
            type: string;
            properties: {};
        };
    };
};

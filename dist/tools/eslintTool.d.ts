/**
 * Wraps ESLint as a function the agent can call.
 *
 * Deliberately shells out to the repo's own ESLint config rather than
 * embedding a hardcoded ruleset — this is the tool the repo's maintainers
 * already trust, and the bot should defer to it rather than impose its
 * own opinions about style. See ARCHITECTURE.md decision 2.
 */
import { ToolFinding } from "../types";
export declare function runEslint(filenames: string[]): Promise<ToolFinding[]>;
/** Tool definition exposed to the model for function-calling. */
export declare const eslintToolDefinition: {
    type: "function";
    function: {
        name: string;
        description: string;
        parameters: {
            type: string;
            properties: {
                filenames: {
                    type: string;
                    items: {
                        type: string;
                    };
                    description: string;
                };
            };
            required: string[];
        };
    };
};

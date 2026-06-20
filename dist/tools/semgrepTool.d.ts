/**
 * Wraps Semgrep as a function the agent can call.
 *
 * Semgrep catches security and correctness patterns (SQL injection
 * shapes, hardcoded secrets, unsafe deserialization) via pattern
 * matching against a known rule database — exactly the kind of
 * "matching against known bad patterns" task a deterministic tool does
 * more reliably than asking a model to "look for security issues."
 *
 * Requires `semgrep` to be installed (pip install semgrep, or via the
 * official Action: returntocorp/semgrep-action). If it's not available
 * this tool degrades gracefully and returns no findings rather than
 * crashing the pipeline.
 */
import { ToolFinding } from "../types";
export declare function runSemgrep(filenames: string[]): Promise<ToolFinding[]>;
export declare const semgrepToolDefinition: {
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

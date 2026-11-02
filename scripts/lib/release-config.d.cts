export function permanentOrigin(value: string | undefined, name: string): string;
export function releaseEnvironment(env: Record<string, string | undefined>, config?: {
  owner?: string;
  extra?: { eas?: { projectId?: string } };
  android?: { package?: string };
}): Record<string, string | undefined>;
export function releaseProblems(env: Record<string, string | undefined>): string[];
export function assertReleaseEnvironment(env: Record<string, string | undefined>): void;

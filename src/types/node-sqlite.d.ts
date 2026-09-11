declare module "node:sqlite" {
  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }

  export class StatementSync {
    all(...params: unknown[]): Record<string, string>[];
    get(...params: unknown[]): Record<string, string> | undefined;
    run(...params: unknown[]): unknown;
  }
}

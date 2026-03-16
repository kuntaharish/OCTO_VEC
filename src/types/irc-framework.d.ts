declare module 'irc-framework' {
  export class Client {
    constructor();
    connect(opts: any): void;
    on(event: string, cb: (...args: any[]) => void): void;
    join(channel: string): void;
    say(target: string, message: string): void;
    quit(msg?: string): void;
  }
}

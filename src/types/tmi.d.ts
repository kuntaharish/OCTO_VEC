declare module 'tmi.js' {
  namespace tmi {
    interface ChatUserstate {
      username?: string;
      [key: string]: any;
    }
    class Client {
      constructor(opts: any);
      connect(): Promise<any>;
      disconnect(): Promise<any>;
      say(channel: string, message: string): Promise<any>;
      on(event: string, cb: (...args: any[]) => void): void;
    }
  }
  export = tmi;
}

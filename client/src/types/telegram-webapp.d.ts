export {};

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        ready: () => void;
        expand?: () => void;
        BackButton?: {
          show: () => void;
          hide: () => void;
          onClick?: (callback: () => void) => void;
        };
      };
    };
  }
}

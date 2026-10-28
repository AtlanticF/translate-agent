declare module "turndown" {
  type Options = {
    headingStyle?: "setext" | "atx";
    codeBlockStyle?: "indented" | "fenced";
  };

  export default class TurndownService {
    constructor(options?: Options);
    turndown(html: string): string;
  }
}

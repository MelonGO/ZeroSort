import { common, createLowlight } from "lowlight";

export const tiptapLowlight = createLowlight();

tiptapLowlight.register({
  bash: common.bash,
  css: common.css,
  javascript: common.javascript,
  json: common.json,
  markdown: common.markdown,
  plaintext: common.plaintext,
  rust: common.rust,
  sql: common.sql,
  typescript: common.typescript,
  xml: common.xml,
});

tiptapLowlight.registerAlias({
  bash: ["sh", "shell"],
  javascript: ["js", "jsx"],
  plaintext: ["text", "txt"],
  typescript: ["ts", "tsx"],
  xml: ["html"],
});
